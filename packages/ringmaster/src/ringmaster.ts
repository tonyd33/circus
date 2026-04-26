import { Standards } from "@mnke/circus-shared";
import {
  ChimpProfileStore,
  ProfileStore,
  StateManager,
  TopicRegistry,
} from "@mnke/circus-shared/components";
import { createDatabase } from "@mnke/circus-shared/db";
import { NatsLib } from "@mnke/circus-shared/lib";
import type * as Logger from "@mnke/circus-shared/logger";
import {
  connect,
  type JetStreamManager,
  type NatsConnection,
  RetentionPolicy,
  StorageType,
} from "nats";
import { ProfileLoader } from "@/config";
import { EventHandler, type RingmasterConfig } from "@/core";
import { ConsumerManager, JobManager, MetaPublisher } from "@/executors";
import { EventListener, OrchestrationListener, PodWatcher } from "@/listeners";
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
  private orchestrationListener: OrchestrationListener | null = null;
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
    const db = createDatabase(this.config.databaseUrl);
    const topicRegistry = new TopicRegistry(this.nc, db);
    await topicRegistry.start();

    this.stateManager = new StateManager(db);
    this.consumerManager = new ConsumerManager(
      this.jsm,
      this.logger.child({ component: "ConsumerManager" }),
    );
    this.metaPublisher = new MetaPublisher(
      this.nc,
      this.logger.child({ component: "MetaPublisher" }),
    );
    const profileStore = new ProfileStore(db);
    this.profileLoader = new ProfileLoader(
      profileStore,
      this.logger.child({ component: "ProfileLoader" }),
      this.config.profileTemplatePath,
    );
    await this.profileLoader.seedDefaults();

    const chimpProfileStore = new ChimpProfileStore(
      db,
      this.config.defaultProfile,
    );

    this.jobManager = new JobManager(
      {
        namespace: this.config.namespace,
        natsUrl: this.config.natsUrl,
        redisUrl: this.config.redisUrl,
        databaseUrl: this.config.databaseUrl,
      },
      this.profileLoader,
      chimpProfileStore,
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
      chimpProfileStore,
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
      this.eventHandler,
      this.logger.child({ component: "EventListener" }),
    );
    this.orchestrationListener = new OrchestrationListener(
      this.nc,
      this.eventHandler,
      this.logger.child({ component: "OrchestrationListener" }),
    );

    await Promise.all([
      this.podCache.start(),
      this.eventListener.start(),
      this.orchestrationListener.start(),
      this.podWatcher.start(),
      this.jobManager.start(),
    ]);
    this.logger.info("Ringmaster started");
  }

  async stop(): Promise<void> {
    await Promise.all([
      this.podCache?.stop(),
      this.podWatcher?.stop(),
      this.eventListener?.stop(),
      this.orchestrationListener?.stop(),
      this.jobManager?.stop(),
      this.profileLoader?.stop(),
    ]);
    this.podWatcher = null;
    this.eventListener = null;
    this.orchestrationListener = null;
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
      max_msgs: 1_000_000,
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
      NatsLib.ensureStream(jsm, {
        ...streamDefaults,
        name: Standards.Chimp.Naming.orchestrationStreamName(),
        subjects: [Standards.Chimp.Naming.orchestrationFilter()],
      }),
    ]);
  }
}
