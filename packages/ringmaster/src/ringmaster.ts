/**
 * Ringmaster
 *
 * Manages Chimp lifecycle through event-driven orchestration
 */

import { Logger, Standards } from "@mnke/circus-shared";
import {
  isNatsAlreadyExists,
  isNatsNotFound,
} from "@mnke/circus-shared/errors";
import type { ServiceMetrics } from "@mnke/circus-shared/metrics";
import Redis from "ioredis";
import {
  connect,
  type JetStreamManager,
  type NatsConnection,
  RetentionPolicy,
  StorageType,
} from "nats";
import type { ProfileLoader } from "./config/profile-loader.ts";
import {
  createEventHandler,
  type RingmasterEventHandler,
} from "./core/event-handler.ts";
import type { RingmasterConfig } from "./core/types.ts";
import { MessageListener } from "./listeners/message-listener.ts";
import { PodWatcher } from "./listeners/pod-watcher.ts";
import { ConsumerManager } from "./managers/consumer-manager.ts";
import { JobManager } from "./managers/job-manager.ts";
import { RedisManager } from "./managers/redis-manager.ts";

const logger = Logger.createLogger("Ringmaster");

export class Ringmaster {
  private jobManager: JobManager;
  private consumerManager: ConsumerManager | null = null;
  private redisManager: RedisManager | null = null;
  private messageListener: MessageListener | null = null;
  private podWatcher: PodWatcher | null = null;
  private eventHandler: RingmasterEventHandler | null = null;
  private natsUrl: string;
  private redisUrl: string;
  private nc: NatsConnection | null = null;
  private jsm: JetStreamManager | null = null;
  private config: RingmasterConfig;

  constructor(config: RingmasterConfig, profileLoader: ProfileLoader) {
    this.config = config;
    this.jobManager = new JobManager(config, profileLoader);
    this.natsUrl = config.natsUrl;
    this.redisUrl = config.redisUrl;
  }

  /**
   * Initialize the Ringmaster
   */
  async start(): Promise<void> {
    await this.connectRedis();

    await this.connectNats();

    if (!this.nc) {
      throw new Error("Failed to establish NATS connection");
    }

    await this.ensureSharedStreams();

    if (!this.jsm) {
      throw new Error("JetStream manager not initialized");
    }

    this.consumerManager = new ConsumerManager(this.jsm);

    if (!this.redisManager) {
      throw new Error("Redis manager not initialized");
    }

    this.eventHandler = createEventHandler({
      jobManager: this.jobManager,
      consumerManager: this.consumerManager,
      redisManager: this.redisManager,
    });

    this.podWatcher = new PodWatcher(this.config.namespace, this.eventHandler);
    this.messageListener = new MessageListener(this.nc, this.eventHandler);

    await Promise.all([this.messageListener.start(), this.podWatcher.start()]);
    logger.info("Ringmaster started");
  }

  /**
   * Stop the Ringmaster
   */
  async stop(): Promise<void> {
    if (this.podWatcher) {
      await this.podWatcher.stop();
    }
    if (this.messageListener) {
      await this.messageListener.stop();
    }

    if (this.nc) {
      await this.nc.drain();
      await this.nc.close();
      this.nc = null;
      this.jsm = null;
    }

    logger.info("Ringmaster stopped");
  }

  /**
   * Connect to Redis
   */
  private async connectRedis(): Promise<void> {
    this.redisManager = new RedisManager(new Redis(this.redisUrl));
    logger.info("Connected to Redis");
  }

  /**
   * Connect to NATS and initialize JetStream manager
   */
  private async connectNats(): Promise<void> {
    if (this.nc) {
      return;
    }

    this.nc = await connect({
      servers: this.natsUrl,
      maxReconnectAttempts: -1,
      reconnectTimeWait: 2000,
    });

    this.jsm = await this.nc.jetstreamManager();
    logger.info("Connected to NATS JetStream");
  }

  /**
   * Ensure a single stream exists (idempotent)
   */
  private async ensureStream(
    streamName: string,
    subjectPrefix: string,
  ): Promise<void> {
    if (!this.jsm) {
      throw new Error("Not connected to NATS");
    }

    // Check if stream already exists
    try {
      await this.jsm.streams.info(streamName);
      logger.debug({ streamName }, "Stream already exists");
      return;
    } catch (error) {
      if (!isNatsNotFound(error)) {
        throw error;
      }
    }

    // Stream doesn't exist, try to create it
    try {
      await this.jsm.streams.add({
        name: streamName,
        subjects: [`${subjectPrefix}.>`],
        retention: RetentionPolicy.Limits,
        max_age: 7 * 24 * 60 * 60 * 1_000_000_000, // 7 days in nanoseconds
        max_msgs: 100_000,
        storage: StorageType.File,
      });
      logger.info({ streamName }, "Created stream");
    } catch (createError) {
      if (isNatsAlreadyExists(createError)) {
        logger.debug({ streamName }, "Stream already exists (race condition)");
        return;
      }
      throw createError;
    }
  }

  /**
   * Ensure the two shared streams exist (idempotent)
   */
  private async ensureSharedStreams(): Promise<void> {
    await this.ensureStream(
      Standards.Chimp.Naming.inputStreamName(),
      Standards.Chimp.Prefix.INPUTS,
    );
    await this.ensureStream(
      Standards.Chimp.Naming.outputStreamName(),
      Standards.Chimp.Prefix.OUTPUTS,
    );
  }
}
