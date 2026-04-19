/**
 * Bullhorn - Chimp Output Handler
 *
 * Processes chimp output messages and routes them to appropriate destinations
 * (Slack, GitHub, Discord, console logging, etc.)
 */

import { type Logger, Protocol, Standards } from "@mnke/circus-shared";
import {
  createMetrics,
  type ServiceMetrics,
} from "@mnke/circus-shared/metrics";
import { connect, type NatsConnection } from "nats";
import {
  ChimpRequestHandler,
  ConsoleLoggerHandler,
  type OutputHandler,
} from "./handlers.ts";

export interface BullhornConfig {
  /**
   * Custom output handlers to use
   * If not provided, uses ConsoleLoggerHandler by default
   */
  handlers?: OutputHandler[];

  logger: Logger.Logger;

  /**
   * NATS URL (required)
   */
  natsUrl: string;

  /**
   * Port for metrics server
   * If not provided, defaults to 9090
   */
  metricsPort?: number;
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
  private logger: Logger.Logger;
  private metrics: ServiceMetrics;
  private natsUrl: string;
  private nc: NatsConnection | null = null;

  constructor(config: BullhornConfig) {
    this.logger = config.logger;
    this.metrics = createMetrics({ serviceName: "bullhorn" });
    this.natsUrl = config.natsUrl;

    this.handlers = config.handlers ?? [new ConsoleLoggerHandler(this.logger)];
  }

  /**
   * Initialize connection and handlers
   */
  async initialize(): Promise<void> {
    this.logger.info("Initializing Bullhorn...");

    this.nc = await connect({
      servers: this.natsUrl,
      maxReconnectAttempts: -1,
      reconnectTimeWait: 2000,
    });

    this.logger.info({ url: this.natsUrl }, "Connected to NATS");
    this.metrics.incActiveConnections("nats");

    this.handlers.push(new ChimpRequestHandler(this.nc, this.logger));

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

    const sub = this.nc.subscribe("chimp.outputs.>");
    this.logger.info("Subscribed to chimp.outputs.>");

    (async () => {
      for await (const msg of sub) {
        const startTime = Date.now();
        try {
          const subject = msg.subject;
          this.metrics.recordNatsReceived(subject);

          const parsed = Standards.Chimp.Naming.parseOutputSubject(subject);
          if (parsed == null) {
            this.logger.warn({ subject }, "Invalid subject format");
            this.metrics.recordError("invalid_subject", "warning");
            continue;
          }

          const { profile, chimpId } = parsed;

          const rawMessage = msg.json();

          await this.handleMessage(profile, chimpId, rawMessage);

          await this.publishMetaEvent(profile, chimpId);

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

    await new Promise(() => {});
  }

  /**
   * Handle an output message from a chimp
   *
   * @param profile - Profile name (e.g., "slack", "github")
   * @param chimpId - ID of the chimp that sent the message
   * @param message - The raw output message (will be validated)
   */
  async handleMessage(
    profile: string,
    chimpId: string,
    message: unknown,
  ): Promise<void> {
    const result = Protocol.safeParseChimpOutputMessage(message);

    if (!result.success) {
      this.logger.error(
        { profile, chimpId, error: result.error, message },
        "Invalid output message from chimp",
      );
      return;
    }

    const validatedMessage = result.data;

    this.logger.debug(
      { profile, chimpId, messageType: validatedMessage.type },
      "Processing chimp output message",
    );

    await Promise.allSettled(
      this.handlers.map((handler) => handler.handle(chimpId, validatedMessage)),
    ).then((results) => {
      results.forEach((result, index) => {
        if (result.status === "rejected") {
          this.logger.error(
            {
              profile,
              chimpId,
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
   * Publish a meta event after handling an output message
   */
  private async publishMetaEvent(
    profile: string,
    chimpId: string,
  ): Promise<void> {
    if (!this.nc) {
      return;
    }

    const metaEvent: Protocol.MetaEvent = {
      type: "bullhorn-dispatched",
      profile,
      chimpId,
      timestamp: new Date().toISOString(),
    };

    const subject = Standards.Chimp.Naming.metaSubject(profile, chimpId);

    try {
      this.nc.publish(subject, JSON.stringify(metaEvent));
      this.logger.debug({ subject, profile, chimpId }, "Published meta event");
    } catch (error) {
      this.logger.error(
        { err: error, subject },
        "Failed to publish meta event",
      );
    }
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
  async stop(): Promise<void> {
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
