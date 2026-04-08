/**
 * Bullhorn - Chimp Output Handler
 *
 * Processes chimp output messages and routes them to appropriate destinations
 * (Slack, GitHub, Discord, console logging, etc.)
 */

import { createLogger, type Logger } from "@mnke/circus-shared/logger";
import {
  createMetrics,
  type ServiceMetrics,
} from "@mnke/circus-shared/metrics";
import type { ChimpOutputMessage } from "@mnke/circus-shared/protocol";
import { safeParseChimpOutputMessage } from "@mnke/circus-shared/protocol";
import { connect, type NatsConnection } from "nats";
import type { OutputHandler } from "./handlers.ts";
import { ConsoleLoggerHandler } from "./handlers.ts";

export interface BullhornConfig {
  /**
   * Custom output handlers to use
   * If not provided, uses ConsoleLoggerHandler by default
   */
  handlers?: OutputHandler[];

  /**
   * Logger instance
   * If not provided, creates a default logger
   */
  logger?: any;

  /**
   * NATS URL
   * If not provided, uses NATS_URL env var or defaults to localhost
   */
  natsUrl?: string;
}

/**
 * Bullhorn - Routes chimp output messages to handlers
 *
 * Bullhorn is the "announcer" component in the Circus architecture.
 * It receives output messages from chimps and broadcasts them to
 * appropriate destinations (Slack, GitHub, console, etc.)
 */
export class Bullhorn {
  private handlers: OutputHandler[];
  private logger: Logger;
  private metrics: ServiceMetrics;
  private natsUrl: string;
  private nc: NatsConnection | null = null;

  constructor(config: BullhornConfig = {}) {
    this.logger = config.logger ?? createLogger("bullhorn");
    this.metrics = createMetrics({ serviceName: "bullhorn" });
    this.natsUrl =
      config.natsUrl ?? process.env.NATS_URL ?? "nats://localhost:4222";

    // Use provided handlers or default to ConsoleLoggerHandler
    this.handlers = config.handlers ?? [new ConsoleLoggerHandler(this.logger)];
  }

  /**
   * Initialize connection and handlers
   */
  async initialize(): Promise<void> {
    this.logger.info("Initializing Bullhorn...");

    // Connect to NATS
    this.nc = await connect({
      servers: this.natsUrl,
      maxReconnectAttempts: -1,
      reconnectTimeWait: 2000,
    });

    this.logger.info({ url: this.natsUrl }, "Connected to NATS");
    this.metrics.incActiveConnections("nats");

    // Initialize all handlers
    for (const handler of this.handlers) {
      if (handler.initialize) {
        await handler.initialize();
      }
    }

    this.logger.info(
      { handlerCount: this.handlers.length },
      "Bullhorn initialized",
    );
  }

  /**
   * Start listening for chimp output messages
   */
  async start(): Promise<void> {
    if (!this.nc) {
      throw new Error("Bullhorn not initialized. Call initialize() first.");
    }

    await this.initialize();

    // Subscribe to all chimp output messages
    const sub = this.nc.subscribe("chimp.*.output");
    this.logger.info("Subscribed to chimp.*.output");

    // Process messages
    (async () => {
      for await (const msg of sub) {
        const startTime = Date.now();
        try {
          // Extract chimp name from subject (e.g., "chimp.slack-C123.output" -> "slack-C123")
          const subject = msg.subject;
          this.metrics.recordNatsReceived(subject);

          const parts = subject.split(".");
          if (
            parts.length !== 3 ||
            parts[0] !== "chimp" ||
            parts[2] !== "output"
          ) {
            this.logger.warn({ subject }, "Invalid subject format");
            this.metrics.recordError("invalid_subject", "warning");
            continue;
          }

          const chimpName = parts[1];
          const rawMessage = msg.json();
          if (chimpName == null) {
            throw new Error("Invalid subject");
          }

          await this.handleMessage(chimpName, rawMessage);

          const duration = (Date.now() - startTime) / 1000;
          this.metrics.recordNatsProcessed(subject, true, duration);
        } catch (error) {
          this.logger.error({ err: error }, "Error processing output message");
          this.metrics.recordError("message_processing", "error");
          const duration = (Date.now() - startTime) / 1000;
          this.metrics.recordNatsProcessed(msg.subject, false, duration);
        }
      }
    })();

    this.logger.info(
      "Bullhorn started. Listening for chimp output messages...",
    );

    // Keep process alive
    await new Promise(() => {});
  }

  /**
   * Handle an output message from a chimp
   *
   * @param chimpName - Name of the chimp that sent the message
   * @param message - The raw output message (will be validated)
   */
  async handleMessage(chimpName: string, message: unknown): Promise<void> {
    // Validate the message
    const result = safeParseChimpOutputMessage(message);

    if (!result.success) {
      this.logger.error(
        { chimpName, error: result.error, message },
        "Invalid output message from chimp",
      );
      return;
    }

    const validatedMessage = result.data;

    this.logger.debug(
      { chimpName, messageType: validatedMessage.type },
      "Processing chimp output message",
    );

    // Pass to all handlers
    await Promise.allSettled(
      this.handlers.map((handler) =>
        handler.handle(chimpName, validatedMessage),
      ),
    ).then((results) => {
      // Log any handler failures
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          this.logger.error(
            {
              chimpName,
              handlerIndex: index,
              error: result.reason,
            },
            "Handler failed to process message",
          );
        }
      });
    });
  }

  /**
   * Add a new handler
   */
  addHandler(handler: OutputHandler): void {
    this.handlers.push(handler);
    this.logger.info("Added new output handler");
  }

  /**
   * Remove a handler
   */
  removeHandler(handler: OutputHandler): void {
    const index = this.handlers.indexOf(handler);
    if (index > -1) {
      this.handlers.splice(index, 1);
      this.logger.info("Removed output handler");
    }
  }

  /**
   * Start HTTP server for metrics endpoint
   */
  async startMetricsServer(port: number = 9090): Promise<void> {
    Bun.serve({
      port,
      fetch: async (req) => {
        const url = new URL(req.url);

        if (url.pathname === "/metrics") {
          const metrics = await this.metrics.getMetrics();
          return new Response(metrics, {
            headers: { "Content-Type": this.metrics.getContentType() },
          });
        }

        if (url.pathname === "/healthz") {
          return new Response("OK", { status: 200 });
        }

        return new Response("Not Found", { status: 404 });
      },
    });

    this.logger.info({ port }, "Metrics server started");
  }

  /**
   * Cleanup all handlers
   */
  async cleanup(): Promise<void> {
    this.logger.info("Cleaning up Bullhorn...");

    for (const handler of this.handlers) {
      if (handler.cleanup) {
        await handler.cleanup();
      }
    }

    if (this.nc) {
      await this.nc.close();
      this.metrics.decActiveConnections("nats");
    }

    this.logger.info("Bullhorn cleanup complete");
  }
}
