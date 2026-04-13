import { readFile } from "node:fs/promises";
import { Standards } from "@mnke/circus-shared";
import { EnvReader as ER, Typing } from "@mnke/circus-shared/lib";
import { Either } from "@mnke/circus-shared/lib/fp";
import { createLogger } from "@mnke/circus-shared/logger";
import {
  type ChimpCommand,
  type ChimpOutputMessage,
  parseChimpCommand,
  parseInitConfig,
} from "@mnke/circus-shared/protocol";
import { serve } from "bun";
import { type Consumer, connect, type NatsConnection } from "nats";
import type { ChimpBrain, PublishFn } from "@/chimp-brain";

const logger = createLogger("Chimp");

export interface ChimpConfig {
  chimpId: string;
  natsUrl: string;
  inputMode: "nats" | "http";
  outputMode: "nats" | "stdout";
  httpPort: number;
  idleTimeoutMs: number;
}

export class Chimp {
  private config: ChimpConfig;
  private brain: ChimpBrain;
  private nc: NatsConnection | null = null;
  private consumer: Consumer | null = null;
  private isShuttingDown = false;
  private lastActivity = Date.now();
  private idleCheckTimer: Timer | null = null;
  private server: ReturnType<typeof serve> | null = null;

  constructor(
    config: ChimpConfig,
    chimpFactory: (chimpId: string, publish: PublishFn) => ChimpBrain,
  ) {
    this.config = config;

    const publishFn: PublishFn = (message, countAsActivity = true) => {
      if (countAsActivity) {
        this.lastActivity = Date.now();
      }
      if (this.config.outputMode === "nats") {
        if (!this.nc) {
          throw new Error("Publish called before NATS connection established");
        }
        const outputSubject = Standards.Chimp.Naming.outputSubject(
          this.config.chimpId,
        );
        this.nc.publish(outputSubject, JSON.stringify(message));
      } else {
        // stdout mode
        console.log(JSON.stringify(message));
      }
    };

    this.brain = chimpFactory(this.config.chimpId, publishFn);
  }

  async start(): Promise<void> {
    logger.info(
      { chimpId: this.config.chimpId, inputMode: this.config.inputMode },
      "Starting Chimp",
    );

    process.on("SIGINT", () => this.shutdown("explicit_stop"));
    process.on("SIGTERM", () => this.shutdown("explicit_stop"));

    await this.startOutput();
    await this.brain.onStartup();
    logger.info("Chimp startup complete");

    await this.executeInitConfig();
    logger.info("Init config executed");
    await this.startInput();
    this.startIdleCheck();
  }

  private async startOutput() {
    switch (this.config.inputMode) {
      case "nats": {
        this.nc = await connect({
          servers: this.config.natsUrl,
          maxReconnectAttempts: -1,
          reconnectTimeWait: 2000,
        });
        logger.info("Connected to NATS");

        const js = this.nc.jetstream();
        const streamName = Standards.Chimp.Naming.inputStreamName();
        const consumerName = `chimp-${this.config.chimpId}`;

        this.consumer = await js.consumers.get(streamName, consumerName);
        logger.info({ consumerName }, "Connected to JetStream consumer");
        break;
      }
      case "http":
        break;
      default:
        Typing.unreachable(this.config.inputMode);
    }
  }

  private async startInput() {
    switch (this.config.inputMode) {
      case "nats":
        await this.consumeNats();
        break;
      case "http":
        await this.listenHttp();
        break;
      default:
        Typing.unreachable(this.config.inputMode);
    }
  }

  private async consumeNats(): Promise<void> {
    if (!this.consumer) {
      throw new Error("Consumer not initialized");
    }

    const messages = await this.consumer.consume();

    try {
      for await (const msg of messages) {
        logger.info({ subject: msg.subject, seq: msg.seq }, "Received message");

        try {
          const payload = JSON.parse(msg.string());
          const command = parseChimpCommand(payload);

          if (command.command !== "heartbeat") {
            this.lastActivity = Date.now();
          }

          const result = await this.brain.handleMessage(command);

          msg.ack();

          logger.info({ seq: msg.seq }, "Processed message successfully");

          if (result === "stop") {
            await this.shutdown("explicit_stop");
            return;
          }
        } catch (error) {
          logger.error({ err: error }, "Error processing message");
          msg.ack();
        }
      }
    } catch (error) {
      logger.error({ err: error }, "Error in message processing loop");
      await this.shutdown("error");
      process.exit(1);
    }
  }

  private async listenHttp(): Promise<void> {
    this.server = serve({
      port: this.config.httpPort,
      routes: {
        "/command": {
          POST: async (req) => {
            try {
              const payload = await req.json();
              const command = parseChimpCommand(payload);

              if (command.command !== "heartbeat") {
                this.lastActivity = Date.now();
              }

              // Process async, return immediately
              this.processHttpCommand(command).catch((error) => {
                logger.error({ err: error }, "Error processing HTTP command");
              });

              return new Response(null, { status: 202 });
            } catch (error) {
              logger.error({ err: error }, "Invalid command");
              return new Response(
                JSON.stringify({ error: "Invalid command" }),
                {
                  status: 400,
                  headers: { "Content-Type": "application/json" },
                },
              );
            }
          },
        },
        "/health": {
          GET: () => new Response("OK"),
        },
      },
    });

    logger.info({ port: this.config.httpPort }, "HTTP server started");
  }

  private async processHttpCommand(command: ChimpCommand): Promise<void> {
    logger.info({ command: command.command }, "Processing HTTP command");

    try {
      const result = await this.brain.handleMessage(command);
      logger.info({ command: command.command }, "Processed HTTP command");

      if (result === "stop") {
        await this.shutdown("explicit_stop");
      }
    } catch (error) {
      logger.error(
        { err: error, command: command.command },
        "Error processing HTTP command",
      );
    }
  }

  private async executeInitConfig(): Promise<void> {
    const configPath = ER.str(Standards.Chimp.Env.initConfig).read(
      process.env,
    ).value;

    if (Either.isLeft(configPath) || !configPath.value) return;

    const raw = await readFile(configPath.value, "utf-8");
    const config = parseInitConfig(JSON.parse(raw));

    logger.info({ commands: config.commands.length }, "Executing init config");

    for (const cmd of config.commands) {
      logger.info({ command: cmd.command }, "Init command");
      const result = await this.brain.handleMessage(cmd);
      if (result === "stop") {
        logger.info("Init command requested stop");
        break;
      }
    }

    logger.info("Init config complete");
  }

  private startIdleCheck(): void {
    const checkIntervalMs = Math.min(this.config.idleTimeoutMs / 2, 10_000);
    this.idleCheckTimer = setInterval(() => {
      const idleMs = Date.now() - this.lastActivity;
      if (idleMs >= this.config.idleTimeoutMs) {
        logger.info(
          { idleMs, timeoutMs: this.config.idleTimeoutMs },
          "Idle timeout reached, shutting down",
        );
        this.shutdown("idle_timeout");
      }
    }, checkIntervalMs);
  }

  private async shutdown(reason: string): Promise<void> {
    if (this.isShuttingDown) return;
    this.isShuttingDown = true;

    logger.info({ reason }, "Shutting down");

    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
    }

    await this.brain.onShutdown();

    if (this.server) {
      this.server.stop();
    }

    if (this.nc) {
      await this.nc.drain();
      await this.nc.close();
    }

    logger.info("Shutdown complete");
    process.exit(0);
  }
}
