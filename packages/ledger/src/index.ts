#!/usr/bin/env bun

import { Logger } from "@mnke/circus-shared";
import { EnvReader as ER } from "@mnke/circus-shared/lib";
import { Either } from "@mnke/circus-shared/lib/fp";
import { serve } from "bun";
import Redis from "ioredis";
import { createStatusRoutes } from "./routes/status.ts";
import { RedisStatusSource } from "./status-source.ts";

const logger = Logger.createLogger("ledger");

interface LedgerConfig {
  redisUrl: string;
  port: number;
}

let redis: Redis | null = null;

async function shutdown() {
  logger.info("Shutdown signal received");
  if (redis) {
    await redis.quit();
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function main() {
  const result = ER.record({
    redisUrl: ER.str("REDIS_URL").fallback("redis://localhost:6379"),
    port: ER.int("PORT").fallback(6489),
  }).read(process.env).value;

  if (Either.isLeft(result)) {
    logger.error(ER.formatReadError(result.value));
    process.exit(1);
  }

  const config: LedgerConfig = result.value;

  logger.info({ config }, "Ledger starting");

  redis = new Redis(config.redisUrl);
  const statusSource = new RedisStatusSource(
    redis,
    logger.child({ component: "RedisStatusSource" }),
  );
  const routes = createStatusRoutes(statusSource);

  const server = serve({
    port: config.port,
    routes,
  });

  logger.info({ port: config.port }, "Ledger server running");
}

main().catch((error) => {
  logger.error({ err: error }, "Fatal error");
  process.exit(1);
});
