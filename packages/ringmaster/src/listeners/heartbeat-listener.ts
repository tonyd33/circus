/**
 * Ringmaster - Heartbeat Listener
 *
 * Subscribes to heartbeat events from Chimps and updates Redis
 */

import { ChimpNaming } from "@mnke/circus-shared/chimp-naming";
import { createLogger } from "@mnke/circus-shared/logger";
import type Redis from "ioredis";
import {
  connect,
  type JetStreamClient,
  type NatsConnection,
  type Subscription,
} from "nats";
import { handleEvent } from "../adapters/core-adapter.ts";
import type {
  ChimpHealth,
  HeartbeatEvent,
  RingmasterConfig,
} from "../core/types.ts";
import type { PodManager } from "../managers/pod-manager.ts";
import type { StreamManager } from "../managers/stream-manager.ts";

const logger = createLogger("HeartbeatListener");

export class HeartbeatListener {
  private nc: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private redis: Redis;
  private natsUrl: string;
  private subscription: Subscription | null = null;
  private podManager: PodManager;
  private streamManager: StreamManager;

  constructor(
    config: RingmasterConfig,
    redis: Redis,
    podManager: PodManager,
    streamManager: StreamManager,
  ) {
    this.natsUrl = config.natsUrl;
    this.redis = redis;
    this.podManager = podManager;
    this.streamManager = streamManager;
  }

  /**
   * Connect to NATS and start listening for heartbeats
   */
  async start(): Promise<void> {
    this.nc = await connect({
      servers: this.natsUrl,
      maxReconnectAttempts: -1,
      reconnectTimeWait: 2000,
    });

    this.js = this.nc.jetstream();

    // Subscribe to all Chimp heartbeat subjects using wildcard with queue group
    // Pattern: chimp.*.heartbeat
    // Queue group ensures only ONE Ringmaster replica processes each heartbeat
    const sub = this.nc.subscribe("chimp.*.heartbeat", { queue: "ringmaster" });

    logger.info("Subscribed to chimp.*.heartbeat (queue: ringmaster)");

    // Process heartbeat messages
    (async () => {
      for await (const msg of sub) {
        try {
          const event: HeartbeatEvent = JSON.parse(msg.string());
          await this.handleHeartbeat(event);
        } catch (error) {
          logger.error({ err: error }, "Error processing heartbeat");
        }
      }
    })();

    this.subscription = sub;
  }

  /**
   * Handle a heartbeat event by updating Redis and chimp state
   */
  private async handleHeartbeat(event: HeartbeatEvent): Promise<void> {
    const healthKey = ChimpNaming.redisHealthKey(event.chimpName);

    const health: ChimpHealth = {
      lastHeartbeat: event.timestamp,
      messageCount: event.messageCount,
    };

    // Set health in Redis with 30s TTL
    await this.redis.setex(healthKey, 30, JSON.stringify(health));

    logger.info(
      { chimpName: event.chimpName, messageCount: event.messageCount },
      "Updated health",
    );

    // Use core logic to update chimp state to running
    try {
      await handleEvent(
        event.chimpName,
        { type: "heartbeat_received" },
        {
          redis: this.redis,
          podManager: this.podManager,
          streamManager: this.streamManager,
        },
      );
    } catch (error) {
      logger.error(
        { err: error, chimpName: event.chimpName },
        "Error handling heartbeat event",
      );
    }
  }

  /**
   * Stop listening for heartbeats
   */
  async stop(): Promise<void> {
    if (this.subscription) {
      await this.subscription.unsubscribe();
      this.subscription = null;
    }

    if (this.nc) {
      await this.nc.close();
      this.nc = null;
      this.js = null;
    }

    logger.info("Stopped");
  }
}
