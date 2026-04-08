/**
 * Ringmaster - Stream Manager
 *
 * Manages NATS JetStream streams for Chimps
 */

import { ChimpNaming } from "@mnke/circus-shared/chimp-naming";
import {
  isNatsAlreadyExists,
  isNatsNotFound,
} from "@mnke/circus-shared/errors";
import { createLogger } from "@mnke/circus-shared/logger";
import {
  AckPolicy,
  connect,
  DeliverPolicy,
  type JetStreamManager,
  type NatsConnection,
  RetentionPolicy,
  StorageType,
} from "nats";
import type { RingmasterConfig } from "../core/types.ts";

const logger = createLogger("StreamManager");

export class StreamManager {
  private nc: NatsConnection | null = null;
  private jsm: JetStreamManager | null = null;
  private natsUrl: string;

  constructor(config: RingmasterConfig) {
    this.natsUrl = config.natsUrl;
  }

  /**
   * Connect to NATS
   */
  async connect(): Promise<void> {
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
   * Create a NATS stream for a Chimp (idempotent)
   */
  async createStream(chimpName: string): Promise<void> {
    if (!this.jsm) {
      throw new Error("Not connected to NATS");
    }

    const streamName = ChimpNaming.streamName(chimpName);

    // Check if stream already exists
    try {
      await this.jsm.streams.info(streamName);
      logger.debug({ streamName }, "Stream already exists, skipping creation");
      return;
    } catch (error) {
      // Stream doesn't exist (this is expected)
      if (isNatsNotFound(error)) {
        // Continue to creation
      } else {
        throw error;
      }
    }

    // Create stream with subjects for input, output, control, correlation, and heartbeat
    try {
      await this.jsm.streams.add({
        name: streamName,
        subjects: [
          ChimpNaming.inputSubject(chimpName),
          ChimpNaming.outputSubject(chimpName),
          ChimpNaming.controlSubject(chimpName),
          ChimpNaming.correlationSubject(chimpName),
          ChimpNaming.heartbeatSubject(chimpName),
        ],
        retention: RetentionPolicy.Limits, // Delete messages after limits are reached
        max_age: 7 * 24 * 60 * 60 * 1_000_000_000, // 7 days in nanoseconds
        max_msgs: 100_000,
        storage: StorageType.File,
      });

      logger.info({ streamName }, "Created stream");
    } catch (error) {
      // Handle race condition - another ringmaster may have created it
      if (isNatsAlreadyExists(error)) {
        logger.debug(
          { streamName },
          "Stream already exists (race condition), continuing",
        );
        return;
      }
      throw error;
    }
  }

  /**
   * Create a durable consumer for a Chimp (idempotent)
   */
  async createConsumer(chimpName: string): Promise<void> {
    if (!this.jsm) {
      throw new Error("Not connected to NATS");
    }

    const streamName = ChimpNaming.streamName(chimpName);
    const consumerName = ChimpNaming.consumerName(chimpName);

    // Check if consumer already exists
    try {
      await this.jsm.consumers.info(streamName, consumerName);
      logger.debug(
        { consumerName },
        "Consumer already exists, skipping creation",
      );
      return;
    } catch (error) {
      // Consumer doesn't exist (this is expected)
      if (isNatsNotFound(error)) {
        // Continue to creation
      } else {
        throw error;
      }
    }

    // Create durable consumer that only processes input messages
    try {
      await this.jsm.consumers.add(streamName, {
        durable_name: consumerName,
        ack_policy: AckPolicy.Explicit,
        filter_subject: ChimpNaming.inputSubject(chimpName),
        deliver_policy: DeliverPolicy.All,
      });

      logger.info({ consumerName, streamName }, "Created consumer");
    } catch (error) {
      // Handle race condition
      if (isNatsAlreadyExists(error)) {
        logger.debug(
          { consumerName },
          "Consumer already exists (race condition), continuing",
        );
        return;
      }
      throw error;
    }
  }

  /**
   * Delete a NATS stream
   */
  async deleteStream(chimpName: string): Promise<void> {
    if (!this.jsm) {
      throw new Error("Not connected to NATS");
    }

    const streamName = ChimpNaming.streamName(chimpName);

    try {
      await this.jsm.streams.delete(streamName);
      logger.info({ streamName }, "Deleted stream");
    } catch (error) {
      if (isNatsNotFound(error)) {
        logger.debug({ streamName }, "Stream doesn't exist, skipping deletion");
        return;
      }
      throw error;
    }
  }

  /**
   * Close NATS connection
   */
  async close(): Promise<void> {
    if (this.nc) {
      await this.nc.close();
      this.nc = null;
      this.jsm = null;
      logger.info("Disconnected from NATS");
    }
  }
}
