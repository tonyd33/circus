import { ProfileStore, TopicRegistry } from "@mnke/circus-shared/components";
import { createDatabase } from "@mnke/circus-shared/db";
import { Typing } from "@mnke/circus-shared/lib";
import type * as Logger from "@mnke/circus-shared/logger";
import Redis from "ioredis";
import type { NatsConnection } from "nats";
import { connect } from "nats";
import type { BrainFactory, ChimpBrain, PublishFn } from "@/chimp-brain";
import { CircusMcp } from "@/mcp/circus-mcp";
import {
  type ChimpInput,
  type ChimpOutput,
  HttpInput,
  type MessageHandler,
  NatsInput,
  NatsOutput,
  StdoutOutput,
} from "@/transports";

export interface ChimpConfig {
  chimpId: string;
  profile: string;
  provider: string;
  model: string;
  natsUrl: string;
  redisUrl: string;
  databaseUrl: string;
  inputMode: "nats" | "http";
  outputMode: "nats" | "stdout";
  httpPort: number;
  idleTimeoutMs: number;
  logger: Logger.Logger;
}

export class Chimp {
  private config: ChimpConfig;
  private logger: Logger.Logger;
  private brainFactory: BrainFactory;
  private nc: NatsConnection | null = null;
  private brain: ChimpBrain | null = null;
  private input: ChimpInput | null = null;
  private output: ChimpOutput | null = null;
  private mcp: CircusMcp | null = null;
  private topicRegistry: TopicRegistry | null = null;
  private isShuttingDown = false;
  private lastActivity = Date.now();
  private idleCheckTimer: Timer | null = null;

  constructor(config: ChimpConfig, brainFactory: BrainFactory) {
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

      const db = createDatabase(this.config.databaseUrl);
      this.topicRegistry = new TopicRegistry(this.nc, db);
      await this.topicRegistry.start();
      this.logger.info("Topic registry connected");
    }

    this.output = this.createOutput();
    const output = this.output;

    const publishFn: PublishFn = (message) => {
      this.lastActivity = Date.now();
      output.publish(message);
    };

    const profileRedis = new Redis(this.config.redisUrl);
    const profileStore = new ProfileStore(profileRedis);

    this.mcp = new CircusMcp({
      publish: publishFn,
      chimpId: this.config.chimpId,
      profile: this.config.profile,
      profileStore,
      topicRegistry: this.topicRegistry,
      logger: this.logger.child({ component: "MCP" }),
    });
    const mcpUrl = await this.mcp.start();

    this.brain = this.brainFactory.create(
      this.config.chimpId,
      this.config.provider,
      this.config.model,
      publishFn,
      this.logger.child({ component: "Brain" }),
      mcpUrl,
    );
    const brain = this.brain;
    brain.setProfileStore(profileStore);
    if (this.topicRegistry) {
      brain.setTopicRegistry(this.topicRegistry);
    }
    brain.onEventContextsChanged = (list) => this.mcp?.setEventContexts(list);

    await brain.onStartup();
    this.logger.info("Chimp startup complete");

    await this.executeInitCommands(brain, profileStore);
    this.logger.info("Init config executed");

    const onActivity = () => {
      this.lastActivity = Date.now();
    };
    const onStop = (reason: "explicit_stop" | "error") => this.shutdown(reason);
    const handler: MessageHandler = (command) => {
      return brain.handleCommand(command);
    };

    this.input = this.createInput(handler, onActivity, onStop);

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
    onStop: (reason: "explicit_stop" | "error") => Promise<void>,
  ): ChimpInput {
    switch (this.config.inputMode) {
      case "nats":
        if (!this.nc) throw new Error("NATS connection not established");
        return new NatsInput(
          this.nc,
          this.config.chimpId,
          handler,
          onActivity,
          onStop,
          this.logger.child({ component: "NatsInput" }),
        );
      case "http":
        return new HttpInput(
          this.config.httpPort,
          handler,
          onActivity,
          onStop,
          this.logger.child({ component: "HttpInput" }),
        );
      default:
        return Typing.unreachable(this.config.inputMode);
    }
  }

  private async executeInitCommands(
    brain: ChimpBrain,
    profileStore: ProfileStore,
  ): Promise<void> {
    try {
      const profile = await profileStore.get(this.config.profile);
      if (!profile || profile.initCommands.length === 0) return;

      this.logger.info(
        { commands: profile.initCommands.length },
        "Executing init commands",
      );

      for (const cmd of profile.initCommands) {
        this.logger.info({ command: cmd.command }, "Init command");
        const result = await brain.handleCommand(cmd);
        if (result === "stop") {
          this.logger.info("Init command requested stop");
          break;
        }
      }

      this.logger.info("Init commands complete");
    } catch (err) {
      this.logger.error({ err }, "Error executing init commands");
    }
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
      } else {
        this.logger.info(
          { idleMs, timeoutMs: this.config.idleTimeoutMs },
          "Not idle",
        );
      }
    }, checkIntervalMs);
  }

  private async shutdown(
    reason: "explicit_stop" | "idle_timeout" | "error",
  ): Promise<void> {
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

    if (this.mcp) {
      await this.mcp.stop();
    }

    // Chimp owns NATS connection — drain and close last
    if (this.nc) {
      await this.nc.drain();
      await this.nc.close();
    }

    this.logger.info("Shutdown complete");
    process.exit(reason === "error" ? 1 : 0);
  }
}
