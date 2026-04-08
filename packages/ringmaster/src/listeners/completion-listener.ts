/**
 * Ringmaster - Completion Listener
 *
 * Subscribes to completion events from Chimps and triggers cleanup
 */

import { createLogger } from "@mnke/circus-shared/logger";
import { connect, type NatsConnection, type Subscription } from "nats";
import type { RingmasterConfig } from "../core/types.ts";

const logger = createLogger("CompletionListener");

export interface CompletionEvent {
  type: "completion";
  chimpName: string;
  timestamp: number;
  reason: "idle_timeout" | "explicit_stop" | "error";
  messageCount: number;
  sessionId?: string;
}

export class CompletionListener {
  private nc: NatsConnection | null = null;
  private subscription: Subscription | null = null;
  private natsUrl: string;
  private onChimpCompleted: (
    chimpName: string,
    event: CompletionEvent,
  ) => Promise<void>;

  constructor(
    config: RingmasterConfig,
    onChimpCompleted: (
      chimpName: string,
      event: CompletionEvent,
    ) => Promise<void>,
  ) {
    this.natsUrl = config.natsUrl;
    this.onChimpCompleted = onChimpCompleted;
  }

  /**
   * Connect to NATS and start listening for completion events
   */
  async start(): Promise<void> {
    this.nc = await connect({
      servers: this.natsUrl,
      maxReconnectAttempts: -1,
      reconnectTimeWait: 2000,
    });

    // Subscribe to all Chimp control subjects using wildcard with queue group
    // Pattern: chimp.*.control
    // Queue group ensures only ONE Ringmaster replica processes each completion event
    const sub = this.nc.subscribe("chimp.*.control", { queue: "ringmaster" });

    logger.info("Subscribed to chimp.*.control (queue: ringmaster)");

    // Process completion messages
    (async () => {
      for await (const msg of sub) {
        try {
          const event = JSON.parse(msg.string()) as CompletionEvent;

          // Only handle completion events
          if (event.type !== "completion") {
            continue;
          }

          logger.info(
            { chimpName: event.chimpName, reason: event.reason },
            "Chimp completed",
          );

          // Trigger cleanup
          await this.onChimpCompleted(event.chimpName, event);
        } catch (error) {
          logger.error({ err: error }, "Error processing completion event");
        }
      }
    })();

    this.subscription = sub;
  }

  /**
   * Stop listening for completion events
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
