import { type Logger, Standards } from "@mnke/circus-shared";
import { NatsLib, ProfileStore, TopicRegistry } from "@mnke/circus-shared/lib";
import Redis from "ioredis";
import {
  connect,
  type JetStreamManager,
  type NatsConnection,
  RetentionPolicy,
  StorageType,
} from "nats";
import { ProfileLoader } from "@/config";
import { EventHandler, type RingmasterConfig } from "@/core";
import {
  ConsumerManager,
  JobManager,
  MetaPublisher,
  StateManager,
} from "@/executors";
import { EventListener, OutputListener, PodWatcher } from "@/listeners";
import { PodCache } from "@/state";

export class Ringmaster {
  private config: RingmasterConfig;
  private logger: Logger.Logger;
  private profileLoader: ProfileLoader | null = null;

  private nc: NatsConnection | null = null;
  private jsm: JetStreamManager | null = null;

  private stateManager: StateManager | null = null;
  private jobManager: JobManager | null = null;
  private consumerManager: ConsumerManager | null = null;
  private metaPublisher: MetaPublisher | null = null;

  private podCache: PodCache | null = null;

  private eventHandler: EventHandler | null = null;

  private eventListener: EventListener | null = null;
  private outputListener: OutputListener | null = null;
  private podWatcher: PodWatcher | null = null;

  constructor(config: RingmasterConfig, logger: Logger.Logger) {
    this.config = config;
    this.logger = logger;
  }

  async start(): Promise<void> {
    this.nc = await connect({
      servers: this.config.natsUrl,
      maxReconnectAttempts: -1,
      reconnectTimeWait: 2000,
    });

    this.jsm = await this.nc.jetstreamManager();
    this.logger.info("Connected to NATS JetStream");

    await this.ensureSharedStreams(this.jsm);
    const topicRegistry = new TopicRegistry(this.nc);
    await topicRegistry.start();

    this.stateManager = new StateManager(
      this.config.redisUrl,
      this.logger.child({ component: "StateManager" }),
    );
    this.consumerManager = new ConsumerManager(
      this.jsm,
      this.logger.child({ component: "ConsumerManager" }),
    );
    this.metaPublisher = new MetaPublisher(
      this.nc,
      this.logger.child({ component: "MetaPublisher" }),
    );
    const profileRedis = new Redis(this.config.redisUrl);
    const profileStore = new ProfileStore(profileRedis);
    this.profileLoader = new ProfileLoader(
      profileStore,
      this.logger.child({ component: "ProfileLoader" }),
      this.config.profileTemplatePath,
    );
    await this.profileLoader.seedDefaults();

    this.jobManager = new JobManager(
      this.config,
      this.profileLoader,
      this.logger.child({ component: "JobManager" }),
    );

    this.podCache = new PodCache(
      this.config.namespace,
      this.logger.child({ component: "PodCache" }),
    );

    this.eventHandler = new EventHandler({
      nc: this.nc,
      jobManager: this.jobManager,
      consumerManager: this.consumerManager,
      stateManager: this.stateManager,
      metaPublisher: this.metaPublisher,
      topicRegistry,
      podCache: this.podCache,
      logger: this.logger.child({ component: "EventHandler" }),
    });

    this.podWatcher = new PodWatcher(
      this.config.namespace,
      this.eventHandler,
      this.logger.child({ component: "PodWatcher" }),
    );
    this.eventListener = new EventListener(
      this.nc,
      topicRegistry,
      this.eventHandler,
      this.logger.child({ component: "EventListener" }),
    );
    this.outputListener = new OutputListener(
      this.nc,
      this.eventHandler,
      this.stateManager,
      this.logger.child({ component: "OutputListener" }),
    );

    await Promise.all([
      this.podCache.start(),
      this.eventListener.start(),
      this.outputListener.start(),
      this.podWatcher.start(),
      this.stateManager.start(),
      this.jobManager.start(),
    ]);
    this.logger.info("Ringmaster started");
  }

  async stop(): Promise<void> {
    await Promise.all([
      this.podCache?.stop(),
      this.podWatcher?.stop(),
      this.eventListener?.stop(),
      this.outputListener?.stop(),
      this.stateManager?.stop(),
      this.jobManager?.stop(),
      this.profileLoader?.stop(),
    ]);
    this.podWatcher = null;
    this.eventListener = null;
    this.outputListener = null;
    this.stateManager = null;
    this.jobManager = null;
    this.profileLoader = null;

    if (this.nc) {
      await this.nc.drain();
      await this.nc.close();
      this.nc = null;
      this.jsm = null;
    }

    this.logger.info("Ringmaster stopped");
  }

  private async ensureSharedStreams(jsm: JetStreamManager): Promise<void> {
    const streamDefaults = {
      retention: RetentionPolicy.Limits,
      max_age: 7 * 24 * 60 * 60 * 1_000_000_000,
      max_msgs: 100_000,
      storage: StorageType.File,
    };

    await Promise.all([
      NatsLib.ensureStream(jsm, {
        ...streamDefaults,
        name: Standards.Chimp.Naming.eventsStreamName(),
        subjects: [`${Standards.Chimp.Prefix.EVENTS}.>`],
      }),
      NatsLib.ensureStream(jsm, {
        ...streamDefaults,
        name: Standards.Chimp.Naming.outputsStreamName(),
        subjects: [`${Standards.Chimp.Prefix.OUTPUTS}.>`],
      }),
    ]);
  }
}
