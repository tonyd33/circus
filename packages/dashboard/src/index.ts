#!/usr/bin/env bun

import { Logger } from "@mnke/circus-shared";
import { EnvReader as ER } from "@mnke/circus-shared/lib";
import { Either } from "@mnke/circus-shared/lib/fp";
import { serve } from "bun";
import Redis from "ioredis";
import { connect } from "nats";
import index from "./index.html";
import { RedisStatusSource } from "./lib/status-source";
import { ActivityRouter } from "./routes/activity";
import { ChimpRouter } from "./routes/chimps";
import { MessageRouter } from "./routes/messages";

const logger = Logger.createLogger("dashboard");

async function main() {
  const result = ER.record({
    redisUrl: ER.str("REDIS_URL").fallback("redis://localhost:6379"),
    natsUrl: ER.str("NATS_URL").fallback("nats://localhost:4222"),
  }).read(process.env).value;

  if (Either.isLeft(result)) {
    logger.error(ER.formatReadError(result.value));
    process.exit(1);
  }

  const config = result.value;

  const redis = new Redis(config.redisUrl);
  const statusSource = new RedisStatusSource(
    redis,
    logger.child({ component: "StatusSource" }),
  );

  const nc = await connect({
    servers: config.natsUrl,
    maxReconnectAttempts: -1,
    reconnectTimeWait: 2000,
  });
  logger.info({ url: config.natsUrl }, "Connected to NATS");

  const activityRouter = new ActivityRouter(
    nc,
    logger.child({ component: "ActivityRouter" }),
  );
  const chimpRouter = new ChimpRouter(
    statusSource,
    nc,
    logger.child({ component: "ChimpRouter" }),
  );
  const messageRouter = new MessageRouter(
    nc,
    logger.child({ component: "MessageRouter" }),
  );

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    await nc.drain();
    await nc.close();
    await redis.quit();
    process.exit(0);
  };

  process.on("SIGINT", () =>
    shutdown("SIGINT").catch((e) => {
      logger.error({ err: e }, "Shutdown error");
      process.exit(1);
    }),
  );
  process.on("SIGTERM", () =>
    shutdown("SIGTERM").catch((e) => {
      logger.error({ err: e }, "Shutdown error");
      process.exit(1);
    }),
  );

  const server = serve({
    routes: {
      "/*": index,
      ...activityRouter.routes,
      ...chimpRouter.routes,
      ...messageRouter.routes,
    },

    development: process.env.NODE_ENV !== "production" && {
      hmr: true,
      console: true,
    },
  });

  logger.info({ url: server.url.toString() }, "Dashboard server started");
}

main().catch((error) => {
  logger.error({ err: error }, "Fatal error");
  process.exit(1);
});
