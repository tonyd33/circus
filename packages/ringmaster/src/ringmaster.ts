/**
 * Ringmaster
 *
 * Manages Chimp lifecycle through event-driven orchestration
 */

import { type Logger, Standards } from "@mnke/circus-shared";
import { NatsLib } from "@mnke/circus-shared/lib";
import {
  connect,
  type JetStreamManager,
  type NatsConnection,
  RetentionPolicy,
  StorageType,
} from "nats";
import type { ProfileLoader } from "@/config";
import { EventHandler, type RingmasterConfig } from "@/core";
import {
  ConsumerManager,
  JobManager,
  MetaPublisher,
  StateManager,
} from "@/executors";
import { MessageListener, PodWatcher } from "@/listeners";

export class Ringmaster {
  private config: RingmasterConfig;
  private logger: Logger.Logger;
  private profileLoader: ProfileLoader;

  private nc: NatsConnection | null = null;
  private jsm: JetStreamManager | null = null;

  private stateManager: StateManager | null = null;
  private jobManager: JobManager | null = null;
  private consumerManager: ConsumerManager | null = null;
  private metaPublisher: MetaPublisher | null = null;

  private eventHandler: EventHandler | null = null;

  private messageListener: MessageListener | null = null;
  private podWatcher: PodWatcher | null = null;

  constructor(
    config: RingmasterConfig,
    profileLoader: ProfileLoader,
    logger: Logger.Logger,
  ) {
    this.config = config;
    this.logger = logger;
    this.profileLoader = profileLoader;
  }

  /**
   * Initialize the Ringmaster
   */
  async start(): Promise<void> {
    this.nc = await connect({
      servers: this.config.natsUrl,
      maxReconnectAttempts: -1,
      reconnectTimeWait: 2000,
    });

    this.jsm = await this.nc.jetstreamManager();
    this.logger.info("Connected to NATS JetStream");
    await this.ensureSharedStreams(this.jsm);

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
    this.jobManager = new JobManager(
      this.config,
      this.profileLoader,
      this.logger.child({ component: "JobManager" }),
    );

    this.eventHandler = new EventHandler({
      jobManager: this.jobManager,
      consumerManager: this.consumerManager,
      stateManager: this.stateManager,
      metaPublisher: this.metaPublisher,
      logger: this.logger.child({ component: "EventHandler" }),
    });

    this.podWatcher = new PodWatcher(
      this.config.namespace,
      this.eventHandler,
      this.logger.child({ component: "PodWatcher" }),
    );
    this.messageListener = new MessageListener(
      this.nc,
      this.eventHandler,
      this.logger.child({ component: "MessageListener" }),
    );

    await Promise.all([
      this.messageListener.start(),
      this.podWatcher.start(),
      this.stateManager.start(),
      this.jobManager.start(),
    ]);
    this.logger.info("Ringmaster started");
  }

  /**
   * Stop the Ringmaster
   */
  async stop(): Promise<void> {
    await Promise.all([
      this.podWatcher?.stop(),
      this.messageListener?.stop(),
      this.stateManager?.stop(),
      this.jobManager?.stop(),
    ]);
    this.podWatcher = null;
    this.messageListener = null;
    this.stateManager = null;
    this.jobManager = null;

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
      max_age: 7 * 24 * 60 * 60 * 1_000_000_000, // 7 days in nanoseconds
      max_msgs: 100_000,
      storage: StorageType.File,
    };

    await Promise.all([
      NatsLib.ensureStream(jsm, {
        ...streamDefaults,
        name: Standards.Chimp.Naming.inputStreamName(),
        subjects: [`${Standards.Chimp.Prefix.INPUTS}.>`],
      }),
      NatsLib.ensureStream(jsm, {
        ...streamDefaults,
        name: Standards.Chimp.Naming.outputStreamName(),
        subjects: [`${Standards.Chimp.Prefix.OUTPUTS}.>`],
      }),
    ]);
  }
}
