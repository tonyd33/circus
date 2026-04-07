/**
 * Usher - Event Correlation Service
 *
 * The Usher guides events from various sources to their appropriate Chimp sessions
 */

import {
  connect,
  type NatsConnection,
  type JetStreamManager,
  RetentionPolicy,
  StorageType,
  AckPolicy,
  DeliverPolicy,
} from "nats";
import Redis from "ioredis";
import { createLogger } from "@mnke/circus-shared/logger";
import { SessionStore } from "./session-store.ts";
import { Correlator } from "./correlator.ts";
import { normalizeSlackEvent, verifySlackSignature } from "./adapters/slack.ts";
import { normalizeTestEvent } from "./adapters/test.ts";
import type { NormalizedEvent } from "./types.ts";

const logger = createLogger("Usher");

/**
 * Correlation event from Chimp
 */
interface CorrelationEvent {
  type:
    | "github-pr"
    | "github-issue"
    | "jira-issue"
    | "slack-thread"
    | "discord-thread";
  sessionName: string;
  timestamp: number;
  // Type-specific fields
  repo?: string;
  prNumber?: number;
  issueNumber?: number;
  issueKey?: string;
  channelId?: string;
  threadTs?: string;
  threadId?: string;
}

/**
 * Main Usher service
 */
class UsherService {
  private sessionStore: SessionStore;
  private correlator: Correlator;
  private nc: NatsConnection | null = null;
  private jsm: JetStreamManager | null = null;
  private redis: Redis;

  constructor() {
    // Initialize components
    const redisUrl = process.env.REDIS_URL || "redis://localhost:6379";
    this.redis = new Redis(redisUrl);
    this.sessionStore = new SessionStore(redisUrl);
    this.correlator = new Correlator(this.sessionStore);
  }

  /**
   * Connect to NATS and start listening for correlation events
   */
  async initialize(): Promise<void> {
    const natsUrl = process.env.NATS_URL || "nats://localhost:4222";

    this.nc = await connect({
      servers: natsUrl,
      maxReconnectAttempts: -1,
      reconnectTimeWait: 2000,
    });

    logger.info({ url: natsUrl }, "Connected to NATS");

    // Initialize JetStream manager for stream/consumer creation
    this.jsm = await this.nc.jetstreamManager();
    logger.info("JetStream manager initialized");

    // Subscribe to correlation events from all Chimps
    this.startCorrelationListener();
  }

  /**
   * Start listening for correlation events from Chimps
   */
  private startCorrelationListener(): void {
    if (!this.nc) {
      throw new Error("NATS connection not initialized");
    }

    // Subscribe to all Chimp correlation events
    const sub = this.nc.subscribe("chimp.*.correlation");

    logger.info("Subscribed to chimp.*.correlation");

    // Process correlation events
    (async () => {
      for await (const msg of sub) {
        try {
          const event: CorrelationEvent = JSON.parse(msg.string());
          await this.handleCorrelationEvent(event);
        } catch (error) {
          logger.error({ err: error }, "Error processing correlation event");
        }
      }
    })();
  }

  /**
   * Handle a correlation event from a Chimp
   */
  private async handleCorrelationEvent(event: CorrelationEvent): Promise<void> {
    logger.info(
      { eventType: event.type, sessionName: event.sessionName },
      "Received correlation event",
    );

    try {
      // Update Redis indexes based on event type
      switch (event.type) {
        case "github-pr":
          if (event.repo && event.prNumber) {
            const key = `github:pr:${event.repo}:${event.prNumber}`;
            await this.redis.set(key, event.sessionName, "EX", 1800); // 30 min TTL
            logger.info(
              { key, sessionName: event.sessionName },
              "Updated correlation",
            );
          }
          break;

        case "github-issue":
          if (event.repo && event.issueNumber) {
            const key = `github:issue:${event.repo}:${event.issueNumber}`;
            await this.redis.set(key, event.sessionName, "EX", 1800);
            logger.info(
              { key, sessionName: event.sessionName },
              "Updated correlation",
            );
          }
          break;

        case "jira-issue":
          if (event.issueKey) {
            const key = `jira:issue:${event.issueKey}`;
            await this.redis.set(key, event.sessionName, "EX", 1800);
            logger.info(
              { key, sessionName: event.sessionName },
              "Updated correlation",
            );
          }
          break;

        case "slack-thread":
          if (event.channelId && event.threadTs) {
            const key = `slack:thread:${event.threadTs}`;
            await this.redis.set(key, event.sessionName, "EX", 1800);
            logger.info(
              { key, sessionName: event.sessionName },
              "Updated correlation",
            );
          }
          break;

        case "discord-thread":
          if (event.channelId && event.threadId) {
            const key = `discord:thread:${event.threadId}`;
            await this.redis.set(key, event.sessionName, "EX", 1800);
            logger.info(
              { key, sessionName: event.sessionName },
              "Updated correlation",
            );
          }
          break;

        default:
          logger.warn(
            { eventType: (event as any).type },
            "Unknown correlation event type",
          );
      }
    } catch (error) {
      logger.error({ err: error }, "Failed to update correlation");
    }
  }

  /**
   * Ensure a Chimp's stream and consumer exist (idempotent)
   *
   * This allows Usher to publish messages without worrying about infrastructure.
   * Uses try-add-then-update pattern for idempotency.
   */
  private async ensureStreamAndConsumer(chimpName: string): Promise<void> {
    if (!this.jsm) {
      throw new Error("JetStream manager not initialized");
    }

    const streamName = `chimp-${chimpName}`;
    const consumerName = `chimp-${chimpName}-consumer`;

    const streamConfig = {
      name: streamName,
      subjects: [
        `chimp.${chimpName}.input`,
        `chimp.${chimpName}.output`,
        `chimp.${chimpName}.control`,
        `chimp.${chimpName}.correlation`,
        `chimp.${chimpName}.heartbeat`,
      ],
      retention: RetentionPolicy.Limits,
      max_age: 7 * 24 * 60 * 60 * 1_000_000_000, // 7 days in nanoseconds
      max_msgs: 100_000,
      storage: StorageType.File,
    };

    // Ensure stream exists (idempotent)
    try {
      await this.jsm.streams.add(streamConfig);
      logger.info({ streamName }, "Created stream");
    } catch (error: any) {
      if (
        error.message?.includes("already") ||
        error.message?.includes("name already in use")
      ) {
        // Stream exists - optionally update it to ensure config is current
        await this.jsm.streams.update(streamName, streamConfig);
      } else {
        throw error;
      }
    }

    // Ensure consumer exists (idempotent)
    try {
      await this.jsm.consumers.add(streamName, {
        durable_name: consumerName,
        ack_policy: AckPolicy.Explicit,
        filter_subject: `chimp.${chimpName}.input`,
        deliver_policy: DeliverPolicy.All,
      });
      logger.info({ consumerName }, "Created consumer");
    } catch (error: any) {
      if (error.message?.includes("already exists")) {
        // Consumer exists, that's fine
      } else {
        throw error;
      }
    }
  }

  /**
   * Process an event - the main entry point
   *
   * Target: < 1 second total (ideally 100-200ms)
   */
  async processEvent(event: NormalizedEvent): Promise<void> {
    if (!this.nc) {
      throw new Error("NATS connection not initialized");
    }

    const startTime = Date.now();

    try {
      // 1. Correlate event to session (< 50ms target)
      const result = await this.correlator.correlate(event);
      const correlateTime = Date.now() - startTime;

      logger.info(
        {
          exchangeName: result.exchangeName,
          isNew: result.isNew,
          correlateTime,
        },
        "Event correlated to session",
      );

      // 2. Ensure stream and consumer exist (idempotent)
      const ensureStart = Date.now();
      await this.ensureStreamAndConsumer(result.exchangeName);
      const ensureTime = Date.now() - ensureStart;

      logger.debug({ ensureTime }, "Stream ensured");

      // 3. Publish message (fire-and-forget)
      const sendStart = Date.now();
      const inputSubject = `chimp.${result.exchangeName}.input`;

      // Wrap content in a ChimpCommand message
      const message = {
        command: "send-agent-message",
        args: {
          prompt: event.content,
        },
      };

      this.nc.publish(inputSubject, JSON.stringify(message));
      const sendTime = Date.now() - sendStart;

      logger.debug({ inputSubject, sendTime }, "Message published");

      const totalTime = Date.now() - startTime;
      logger.info({ totalTime }, "Event processing complete");

      if (totalTime > 1000) {
        logger.warn({ totalTime }, "Processing took longer than 1s");
      }
    } catch (error) {
      logger.error({ err: error }, "Error processing event");
      throw error;
    }
  }

  /**
   * HTTP Server
   */
  async serve() {
    const port = parseInt(process.env.PORT || "3000");
    const self = this; // Capture this for use in fetch handler

    const server = Bun.serve({
      port,
      async fetch(req) {
        const url = new URL(req.url);

        // Health check
        if (url.pathname === "/healthz") {
          return new Response("OK", { status: 200 });
        }

        // Slack webhook
        if (url.pathname === "/webhooks/slack" && req.method === "POST") {
          try {
            const body = await req.text();
            const payload = JSON.parse(body);

            // Handle URL verification challenge
            if (payload.type === "url_verification") {
              return new Response(
                JSON.stringify({ challenge: payload.challenge }),
                {
                  headers: { "Content-Type": "application/json" },
                },
              );
            }

            // Verify signature
            const timestamp =
              req.headers.get("x-slack-request-timestamp") || "";
            const signature = req.headers.get("x-slack-signature") || "";
            const signingSecret = process.env.SLACK_SIGNING_SECRET || "";

            if (
              !verifySlackSignature(body, timestamp, signature, signingSecret)
            ) {
              return new Response("Invalid signature", { status: 401 });
            }

            // Normalize event
            const normalized = normalizeSlackEvent(payload);
            if (!normalized) {
              return new Response("Event type not supported", { status: 200 });
            }

            // Process event (async, don't wait)
            self.processEvent(normalized).catch((error) => {
              logger.error({ err: error }, "Failed to process event");
            });

            // Return immediately to Slack
            return new Response("OK", { status: 200 });
          } catch (error) {
            logger.error({ err: error }, "Slack webhook error");
            return new Response("Internal error", { status: 500 });
          }
        }

        // GitHub webhook placeholder
        if (url.pathname === "/webhooks/github" && req.method === "POST") {
          return new Response("GitHub webhooks not yet implemented", {
            status: 501,
          });
        }

        // Discord webhook placeholder
        if (url.pathname === "/webhooks/discord" && req.method === "POST") {
          return new Response("Discord webhooks not yet implemented", {
            status: 501,
          });
        }

        // Jira webhook placeholder
        if (url.pathname === "/webhooks/jira" && req.method === "POST") {
          return new Response("Jira webhooks not yet implemented", {
            status: 501,
          });
        }

        // Test webhook (for testing/development)
        if (url.pathname === "/webhooks/test" && req.method === "POST") {
          try {
            const body = await req.text();
            const payload = JSON.parse(body);

            // Normalize event
            const normalized = normalizeTestEvent(payload);
            if (!normalized) {
              return new Response(
                JSON.stringify({ error: "Invalid test event payload" }),
                {
                  status: 400,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }

            // Process event (async, don't wait)
            self.processEvent(normalized).catch((error) => {
              logger.error({ err: error }, "Failed to process test event");
            });

            // Return immediately with session info
            return new Response(
              JSON.stringify({
                success: true,
                event: {
                  source: normalized.source,
                  eventType: normalized.eventType,
                  content: normalized.content,
                },
              }),
              {
                status: 200,
                headers: { "Content-Type": "application/json" },
              },
            );
          } catch (error) {
            logger.error({ err: error }, "Test webhook error");
            return new Response(JSON.stringify({ error: "Internal error" }), {
              status: 500,
              headers: { "Content-Type": "application/json" },
            });
          }
        }

        return new Response("Not Found", { status: 404 });
      },
    });

    logger.info({ port }, "Server running");
    logger.info("Webhook endpoints available:");
    logger.info("  - POST /webhooks/slack");
    logger.info("  - POST /webhooks/github");
    logger.info("  - POST /webhooks/discord");
    logger.info("  - POST /webhooks/jira");
    logger.info("  - POST /webhooks/test (for testing)");
    logger.info("  - GET /healthz");
  }
}

// Start the service
const service = new UsherService();
await service.initialize();
await service.serve();
