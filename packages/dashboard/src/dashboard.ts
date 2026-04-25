import {
  ChimpProfileStore,
  ProfileStore,
  TopicRegistry,
} from "@mnke/circus-shared/components";
import { createDatabase } from "@mnke/circus-shared/db";
import type * as Logger from "@mnke/circus-shared/logger";
import { serve } from "bun";
import Redis from "ioredis";
import { connect, type NatsConnection } from "nats";
import index from "./index.html";
import { RedisStatusSource } from "./lib/status-source";
import { ActivityRouter } from "./routes/activity";
import { ChimpRouter } from "./routes/chimps";
import { MessageRouter } from "./routes/messages";
import { ProfileRouter } from "./routes/profiles";
import { ChimpService } from "./services/chimp-service";
import { MessageService } from "./services/message-service";
import { ProfileService } from "./services/profile-service";

export interface DashboardConfig {
  redisUrl: string;
  natsUrl: string;
  databaseUrl: string;
  defaultProfile: string;
  port: number;
}

export class Dashboard {
  private config: DashboardConfig;
  private logger: Logger.Logger;
  private nc: NatsConnection | null = null;
  private redis: Redis | null = null;
  private server: ReturnType<typeof serve> | null = null;
  private shuttingDown = false;

  constructor(config: DashboardConfig, logger: Logger.Logger) {
    this.config = config;
    this.logger = logger;
  }

  async start(): Promise<void> {
    this.redis = new Redis(this.config.redisUrl);
    const statusSource = new RedisStatusSource(this.redis);

    this.nc = await connect({
      servers: this.config.natsUrl,
      maxReconnectAttempts: -1,
      reconnectTimeWait: 2000,
    });
    this.logger.info({ url: this.config.natsUrl }, "Connected to NATS");

    const db = createDatabase(this.config.databaseUrl);
    const topicRegistry = new TopicRegistry(this.nc, db);
    await topicRegistry.start();
    const chimpProfileStore = new ChimpProfileStore(
      db,
      this.config.defaultProfile,
    );
    const profileStore = new ProfileStore(this.redis);

    const chimpService = new ChimpService(
      statusSource,
      chimpProfileStore,
      topicRegistry,
      this.nc,
      this.logger.child({ component: "ChimpService" }),
    );
    const messageService = new MessageService(
      this.nc,
      this.logger.child({ component: "MessageService" }),
    );
    const profileService = new ProfileService(
      profileStore,
      this.logger.child({ component: "ProfileService" }),
    );

    const activityRouter = new ActivityRouter(
      this.nc,
      topicRegistry,
      this.logger.child({ component: "ActivityRouter" }),
    );
    const chimpRouter = new ChimpRouter(chimpService);
    const messageRouter = new MessageRouter(messageService);
    const profileRouter = new ProfileRouter(profileService);

    this.server = serve({
      port: this.config.port,
      routes: {
        "/healthz": new Response("OK", { status: 200 }),
        "/*": index,
        ...activityRouter.routes,
        ...chimpRouter.routes,
        ...profileRouter.routes,
        ...messageRouter.routes,
      },
      development: process.env.NODE_ENV !== "production" && {
        hmr: true,
        console: true,
      },
    });

    this.logger.info(
      { url: this.server.url.toString() },
      "Dashboard server started",
    );
  }

  async stop(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;

    this.server?.stop();

    if (this.nc) {
      await this.nc.drain();
      await this.nc.close();
    }

    if (this.redis) {
      await this.redis.quit();
    }
  }
}
