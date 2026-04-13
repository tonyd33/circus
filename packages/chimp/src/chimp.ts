import { readFile } from "node:fs/promises";
import { Standards } from "@mnke/circus-shared";
import { EnvReader as ER, Typing } from "@mnke/circus-shared/lib";
import { Either } from "@mnke/circus-shared/lib/fp";
import { createLogger } from "@mnke/circus-shared/logger";
import { parseInitConfig } from "@mnke/circus-shared/protocol";
import type { NatsConnection } from "nats";
import { connect } from "nats";
import type { ChimpBrain, PublishFn } from "@/chimp-brain";
import {
  type ChimpInput,
  HttpInput,
  type MessageHandler,
  NatsInput,
} from "@/chimp-input";
import { type ChimpOutput, NatsOutput, StdoutOutput } from "@/chimp-output";

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
  private brainFactory: (chimpId: string, publish: PublishFn) => ChimpBrain;
  private nc: NatsConnection | null = null;
  private brain: ChimpBrain | null = null;
  private input: ChimpInput | null = null;
  private output: ChimpOutput | null = null;
  private isShuttingDown = false;
  private lastActivity = Date.now();
  private idleCheckTimer: Timer | null = null;

  constructor(
    config: ChimpConfig,
    brainFactory: (chimpId: string, publish: PublishFn) => ChimpBrain,
  ) {
    this.config = config;
    this.brainFactory = brainFactory;
  }

  async start(): Promise<void> {
    logger.info(
      { chimpId: this.config.chimpId, inputMode: this.config.inputMode },
      "Starting Chimp",
    );

    process.on("SIGINT", () => this.shutdown("explicit_stop"));
    process.on("SIGTERM", () => this.shutdown("explicit_stop"));

    // 1. Connect NATS if needed by either input or output
    if (this.config.outputMode === "nats" || this.config.inputMode === "nats") {
      this.nc = await connect({
        servers: this.config.natsUrl,
        maxReconnectAttempts: -1,
        reconnectTimeWait: 2000,
      });
      logger.info("Connected to NATS");
    }

    // 2. Create output
    this.output = this.createOutput();
    const output = this.output;

    // 3. Create brain with publish wrapper
    const publishFn: PublishFn = (message) => {
      this.lastActivity = Date.now();
      output.publish(message);
    };
    this.brain = this.brainFactory(this.config.chimpId, publishFn);
    const brain = this.brain;

    await brain.onStartup();
    logger.info("Chimp startup complete");

    // 4. Execute init config
    await this.executeInitConfig(brain);
    logger.info("Init config executed");

    // 5. Create input
    const onActivity = () => {
      this.lastActivity = Date.now();
    };
    const onStopRequested = () => this.shutdown("explicit_stop");
    const handler: MessageHandler = (command) => brain.handleMessage(command);

    this.input = this.createInput(handler, onActivity, onStopRequested);

    // 6. Start idle check BEFORE input (input may block in old designs)
    this.startIdleCheck();

    // 7. Start input (non-blocking — fires async loop)
    await this.input.start();
  }

  private createOutput(): ChimpOutput {
    switch (this.config.outputMode) {
      case "nats":
        if (!this.nc) throw new Error("NATS connection not established");
        return new NatsOutput(this.nc, this.config.chimpId);
      case "stdout":
        return new StdoutOutput();
      default:
        return Typing.unreachable(this.config.outputMode);
    }
  }

  private createInput(
    handler: MessageHandler,
    onActivity: () => void,
    onStopRequested: () => Promise<void>,
  ): ChimpInput {
    switch (this.config.inputMode) {
      case "nats":
        if (!this.nc) throw new Error("NATS connection not established");
        return new NatsInput(
          this.nc,
          this.config.chimpId,
          handler,
          onActivity,
          onStopRequested,
        );
      case "http":
        return new HttpInput(
          this.config.httpPort,
          handler,
          onActivity,
          onStopRequested,
        );
      default:
        return Typing.unreachable(this.config.inputMode);
    }
  }

  private async executeInitConfig(brain: ChimpBrain): Promise<void> {
    const configPath = ER.str(Standards.Chimp.Env.initConfig).read(
      process.env,
    ).value;

    if (Either.isLeft(configPath) || !configPath.value) return;

    const raw = await readFile(configPath.value, "utf-8");
    const config = parseInitConfig(JSON.parse(raw));

    logger.info({ commands: config.commands.length }, "Executing init config");

    for (const cmd of config.commands) {
      logger.info({ command: cmd.command }, "Init command");
      const result = await brain.handleMessage(cmd);
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

    // Stop input first (stop accepting messages)
    if (this.input) {
      await this.input.stop();
    }

    // Then shutdown brain (finish in-flight work)
    if (this.brain) {
      await this.brain.onShutdown();
    }

    // Chimp owns NATS connection — drain and close last
    if (this.nc) {
      await this.nc.drain();
      await this.nc.close();
    }

    logger.info("Shutdown complete");
    process.exit(0);
  }
}
