import { readFile } from "node:fs/promises";
import { type Logger, Protocol, Standards } from "@mnke/circus-shared";
import { EnvReader as ER, Typing } from "@mnke/circus-shared/lib";
import { Either } from "@mnke/circus-shared/lib/fp";
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

export interface ChimpConfig {
  chimpId: string;
  model: string;
  natsUrl: string;
  inputMode: "nats" | "http";
  outputMode: "nats" | "stdout";
  httpPort: number;
  idleTimeoutMs: number;
  logger: Logger.Logger;
}

export class Chimp {
  private config: ChimpConfig;
  private logger: Logger.Logger;
  private brainFactory: (
    chimpId: string,
    model: string,
    publish: PublishFn,
    logger: Logger.Logger,
  ) => ChimpBrain;
  private nc: NatsConnection | null = null;
  private brain: ChimpBrain | null = null;
  private input: ChimpInput | null = null;
  private output: ChimpOutput | null = null;
  private isShuttingDown = false;
  private lastActivity = Date.now();
  private idleCheckTimer: Timer | null = null;

  constructor(
    config: ChimpConfig,
    brainFactory: (
      chimpId: string,
      model: string,
      publish: PublishFn,
      logger: Logger.Logger,
    ) => ChimpBrain,
  ) {
    this.config = config;
    this.logger = config.logger;
    this.brainFactory = brainFactory;
  }

  async start(): Promise<void> {
    this.logger.info(
      { chimpId: this.config.chimpId, inputMode: this.config.inputMode },
      "Starting Chimp",
    );

    process.on("SIGINT", () => this.shutdown("explicit_stop"));
    process.on("SIGTERM", () => this.shutdown("explicit_stop"));

    if (this.config.outputMode === "nats" || this.config.inputMode === "nats") {
      this.nc = await connect({
        servers: this.config.natsUrl,
        maxReconnectAttempts: -1,
        reconnectTimeWait: 2000,
      });
      this.logger.info("Connected to NATS");
    }

    this.output = this.createOutput();
    const output = this.output;

    const publishFn: PublishFn = (message) => {
      this.lastActivity = Date.now();
      output.publish(message);
    };
    this.brain = this.brainFactory(
      this.config.chimpId,
      this.config.model,
      publishFn,
      this.logger.child({ component: "Brain" }),
    );
    const brain = this.brain;

    await brain.onStartup();
    this.logger.info("Chimp startup complete");

    await this.executeInitConfig(brain);
    this.logger.info("Init config executed");

    const onActivity = () => {
      this.lastActivity = Date.now();
    };
    const onStopRequested = () => this.shutdown("explicit_stop");
    const handler: MessageHandler = (command) => brain.handleMessage(command);

    this.input = this.createInput(handler, onActivity, onStopRequested);

    this.startIdleCheck();

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
          this.logger.child({ component: "NatsInput" }),
        );
      case "http":
        return new HttpInput(
          this.config.httpPort,
          handler,
          onActivity,
          onStopRequested,
          this.logger.child({ component: "HttpInput" }),
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
    const config = Protocol.parseInitConfig(JSON.parse(raw));

    this.logger.info(
      { commands: config.commands.length },
      "Executing init config",
    );

    for (const cmd of config.commands) {
      this.logger.info({ command: cmd.command }, "Init command");
      const result = await brain.handleMessage(cmd);
      if (result === "stop") {
        this.logger.info("Init command requested stop");
        break;
      }
    }

    this.logger.info("Init config complete");
  }

  private startIdleCheck(): void {
    const checkIntervalMs = Math.min(this.config.idleTimeoutMs / 2, 10_000);
    this.idleCheckTimer = setInterval(() => {
      const idleMs = Date.now() - this.lastActivity;
      if (idleMs >= this.config.idleTimeoutMs) {
        this.logger.info(
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

    this.logger.info({ reason }, "Shutting down");

    if (this.idleCheckTimer) {
      clearInterval(this.idleCheckTimer);
    }

    if (this.input) {
      await this.input.stop();
    }

    if (this.brain) {
      await this.brain.onShutdown();
    }

    // Chimp owns NATS connection — drain and close last
    if (this.nc) {
      await this.nc.drain();
      await this.nc.close();
    }

    this.logger.info("Shutdown complete");
    process.exit(0);
  }
}
