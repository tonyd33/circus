/**
 * Ringmaster - Output Listener
 *
 * Subscribes to output messages from Chimps and updates last activity timestamp in Redis
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
import type { RingmasterConfig } from "../core/types.ts";

const logger = createLogger("OutputListener");

/**
 * Activity tracking in Redis
 * Stores the last time a chimp produced output (any output message)
 */
export interface ChimpActivity {
  lastActivity: number; // Timestamp of last output message
}

export class OutputListener {
  private nc: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private redis: Redis;
  private natsUrl: string;
  private subscription: Subscription | null = null;
  private idleTimeoutMs: number;

  constructor(
    config: RingmasterConfig,
    redis: Redis,
    idleTimeoutMs: number = 300_000, // 5 minutes default
  ) {
    this.natsUrl = config.natsUrl;
    this.redis = redis;
    this.idleTimeoutMs = idleTimeoutMs;
  }

  /**
   * Connect to NATS and start listening for output messages
   */
  async start(): Promise<void> {
    this.nc = await connect({
      servers: this.natsUrl,
      maxReconnectAttempts: -1,
      reconnectTimeWait: 2000,
    });

    this.js = this.nc.jetstream();

    // Subscribe to all Chimp output subjects using wildcard with queue group
    // Pattern: chimp.*.output
    // Queue group ensures only ONE Ringmaster replica processes each output message
    const sub = this.nc.subscribe("chimp.*.output", { queue: "ringmaster" });

    logger.info("Subscribed to chimp.*.output (queue: ringmaster)");

    // Process output messages
    (async () => {
      for await (const msg of sub) {
        try {
          // Extract chimp name from subject (chimp.{chimpName}.output)
          const parts = msg.subject.split(".");
          if (
            parts.length === 3 &&
            parts[0] === "chimp" &&
            parts[2] === "output"
          ) {
            const chimpName = parts[1];
            if (chimpName == null) {
              throw new Error("Bad chimp naming");
            }
            await this.handleOutput(chimpName);
          } else {
            logger.warn(
              { subject: msg.subject },
              "Unexpected output subject format",
            );
          }
        } catch (error) {
          logger.error({ err: error }, "Error processing output message");
        }
      }
    })();

    this.subscription = sub;
  }

  /**
   * Handle an output message by updating last activity timestamp
   */
  private async handleOutput(chimpName: string): Promise<void> {
    const activityKey = ChimpNaming.redisActivityKey(chimpName);
    const now = Date.now();

    const activity: ChimpActivity = {
      lastActivity: now,
    };

    // Set activity in Redis with TTL slightly longer than idle timeout
    // This allows ringmaster to detect when chimp has been idle
    const ttl = Math.ceil(this.idleTimeoutMs / 1000) + 60; // Add 1 minute buffer
    await this.redis.setex(activityKey, ttl, JSON.stringify(activity));

    logger.debug(
      { chimpName, lastActivity: now },
      "Updated activity timestamp",
    );
  }

  /**
   * Stop listening for output messages
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
