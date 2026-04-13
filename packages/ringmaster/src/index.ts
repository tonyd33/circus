#!/usr/bin/env bun

import { Standards } from "@mnke/circus-shared";
import { EnvReader as ER } from "@mnke/circus-shared/lib";
import { Either } from "@mnke/circus-shared/lib/fp";
import { createLogger } from "@mnke/circus-shared/logger";
import type { NatsConnection } from "nats";
import type { RingmasterConfig } from "./core/types.ts";
import { loadChimpJobConfig } from "./lib/chimp-job-config.ts";
import type { RedisManager } from "./managers/redis-manager.ts";
import { Ringmaster } from "./ringmaster.ts";

const logger = createLogger("Ringmaster");

let ringmaster: Ringmaster | null = null;
let redis: RedisManager | null = null;
let nats: NatsConnection | null = null;

async function shutdown() {
  logger.info("Shutdown signal received");
  if (ringmaster) {
    await ringmaster.stop();
  }
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);

async function main() {
  const result = ER.record({
    natsUrl: ER.str("NATS_URL").fallback("nats://localhost:4222"),
    redisUrl: ER.str("REDIS_URL").fallback("redis://localhost:6379"),
    namespace: ER.str("NAMESPACE").fallback("default"),
    chimpImage: ER.str("CHIMP_IMAGE").fallback("circus-chimp"),
    chimpBrainType: ER.str(Standards.Chimp.Env.brainType).fallback("echo"),
    chimpJobConfigPath: ER.str("CHIMP_JOB_CONFIG_PATH").fallback(""),
  }).read(process.env).value;

  if (Either.isLeft(result)) {
    logger.error(ER.formatReadError(result.value));
    process.exit(1);
  }

  const envConfig = result.value;
  const chimpJobConfig = await loadChimpJobConfig(
    envConfig.chimpJobConfigPath || undefined,
  );

  const config: RingmasterConfig = {
    natsUrl: envConfig.natsUrl,
    redisUrl: envConfig.redisUrl,
    namespace: envConfig.namespace,
    chimpImage: envConfig.chimpImage,
    chimpBrainType: envConfig.chimpBrainType,
    chimpJobConfig,
  };

  logger.info({ config }, "Ringmaster starting");

  ringmaster = new Ringmaster(config);

  await ringmaster.start();

  // Extract connections for health checks
  redis = ringmaster.getRedisManager();
  nats = ringmaster.getNatsConnection();

  // Health check endpoints
  const routes = {
    "/health": async () => {
      const health: { redis: string; nats: string } = {
        redis: "unknown",
        nats: "unknown",
      };

      // Check Redis
      if (redis) {
        try {
          const result = await redis.getClient().ping();
          health.redis = result === "PONG" ? "ok" : "error";
        } catch {
          health.redis = "error";
        }
      }

      // Check NATS - verify connection is active
      if (nats) {
        try {
          const isClosed = nats.isClosed();
          health.nats = !isClosed ? "ok" : "error";
        } catch {
          health.nats = "error";
        }
      }

      const allHealthy = health.redis === "ok" && health.nats === "ok";
      return new Response(JSON.stringify(health), {
        status: allHealthy ? 200 : 503,
        headers: { "Content-Type": "application/json" },
      });
    },
    "/health/live": () => {
      return new Response(null, { status: 200 });
    },
  };

  const port = parseInt(process.env.PORT || "3000", 10);
  const server = Bun.serve({
    port,
    fetch(req) {
      const url = new URL(req.url);
      const handler = routes[url.pathname as keyof typeof routes];
      if (handler) {
        return handler();
      }
      return new Response("Not Found", { status: 404 });
    },
  });

  logger.info(`Health server running on port ${server.port}`);
}

main().catch((error) => {
  logger.error({ err: error }, "Fatal error");
  process.exit(1);
});
