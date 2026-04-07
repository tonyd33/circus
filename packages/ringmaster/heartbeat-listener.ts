/**
 * Ringmaster - Heartbeat Listener
 *
 * Subscribes to heartbeat events from Chimps and updates Redis
 */

import type Redis from "ioredis";
import {
  connect,
  type NatsConnection,
  type JetStreamClient,
  type Subscription,
} from "nats";
import { createLogger } from "@mnke/circus-shared/logger";
import {
  ChimpNaming,
  type HeartbeatEvent,
  type ChimpHealth,
  type RingmasterConfig,
} from "./types.ts";

const logger = createLogger("HeartbeatListener");

export class HeartbeatListener {
  private nc: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private redis: Redis;
  private natsUrl: string;
  private subscription: Subscription | null = null;

  constructor(config: RingmasterConfig, redis: Redis) {
    this.natsUrl = config.natsUrl;
    this.redis = redis;
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
   * Handle a heartbeat event by updating Redis
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
