/**
 * Ringmaster - Message Listener
 *
 * Listens to NATS for incoming messages to trigger faster Chimp creation
 */

import { connect, type NatsConnection, type Subscription } from "nats";
import { createLogger } from "@mnke/circus-shared/logger";
import type { RingmasterConfig } from "./types.ts";

const logger = createLogger("MessageListener");

export class MessageListener {
  private nc: NatsConnection | null = null;
  private subscription: Subscription | null = null;
  private natsUrl: string;
  private onChimpNeeded: (chimpName: string) => Promise<void>;

  constructor(
    config: RingmasterConfig,
    onChimpNeeded: (chimpName: string) => Promise<void>,
  ) {
    this.natsUrl = config.natsUrl;
    this.onChimpNeeded = onChimpNeeded;
  }

  /**
   * Connect to NATS and start listening for input messages
   */
  async start(): Promise<void> {
    this.nc = await connect({
      servers: this.natsUrl,
      maxReconnectAttempts: -1,
      reconnectTimeWait: 2000,
    });

    // Subscribe to all Chimp input subjects using wildcard with queue group
    // Pattern: chimp.*.input
    // Queue group ensures only ONE Ringmaster replica processes each message
    const sub = this.nc.subscribe("chimp.*.input", { queue: "ringmaster" });

    logger.info("Subscribed to chimp.*.input (queue: ringmaster)");

    // Process incoming messages
    (async () => {
      for await (const msg of sub) {
        try {
          // Extract chimpName from subject (chimp.{chimpName}.input)
          const parts = msg.subject.split(".");
          if (
            parts.length === 3 &&
            parts[0] === "chimp" &&
            parts[2] === "input"
          ) {
            const chimpName = parts[1];
            if (!chimpName) {
              logger.error({ subject: msg.subject }, "Invalid subject format");
              continue;
            }

            logger.info({ chimpName }, "Detected message for chimp");

            // Trigger Chimp creation (if needed)
            await this.onChimpNeeded(chimpName);
          }
        } catch (error) {
          logger.error({ err: error }, "Error processing message");
        }
      }
    })();

    this.subscription = sub;
  }

  /**
   * Stop listening for messages
   */
  async stop(): Promise<void> {
    if (this.subscription) {
      await this.subscription.unsubscribe();
      this.subscription = null;
    }

    if (this.nc) {
      await this.nc.close();
      this.nc = null;
    }

    logger.info("Stopped");
  }
}
