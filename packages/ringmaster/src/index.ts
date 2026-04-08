#!/usr/bin/env bun

/**
 * Ringmaster - Main Entry Point
 *
 * Manages Chimp lifecycle (pods + NATS streams)
 */

import {
  getEnv,
  getEnvInt,
  validateRequiredEnv,
} from "@mnke/circus-shared/config";
import { createLogger } from "@mnke/circus-shared/logger";
import { createMetrics } from "@mnke/circus-shared/metrics";
import Redis from "ioredis";
import type { RingmasterConfig } from "./core/types.ts";
import { Reconciler } from "./reconciler.ts";

const logger = createLogger("Ringmaster");

// Validate required environment variables
validateRequiredEnv(["ANTHROPIC_API_KEY"]);

// Configuration from environment
const config: RingmasterConfig = {
  redisUrl: getEnv("REDIS_URL", "redis://localhost:6379"),
  natsUrl: getEnv("NATS_URL", "nats://localhost:4222"),
  namespace: getEnv("NAMESPACE", "default"),
  chimpImage: getEnv("CHIMP_IMAGE", "circus-chimp"),
  anthropicApiKey: process.env.ANTHROPIC_API_KEY!, // Validated above
  reconcileInterval: getEnvInt("RECONCILE_INTERVAL", 30000), // 30s default
};

logger.info(
  {
    redisUrl: config.redisUrl,
    natsUrl: config.natsUrl,
    namespace: config.namespace,
    chimpImage: config.chimpImage,
    reconcileInterval: config.reconcileInterval,
  },
  "Ringmaster starting",
);

// Initialize metrics
const metrics = createMetrics({ serviceName: "ringmaster" });

// Connect to Redis
const redis = new Redis(config.redisUrl);
metrics.incActiveConnections("redis");

// Create reconciler
const reconciler = new Reconciler(config, redis, metrics);

// Handle shutdown gracefully
const shutdown = async (signal: string) => {
  logger.info({ signal }, "Shutting down");
  await reconciler.stop();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Start metrics server
const metricsPort = parseInt(process.env.METRICS_PORT || "9093", 10);
Bun.serve({
  port: metricsPort,
  fetch: async (req) => {
    const url = new URL(req.url);

    if (url.pathname === "/metrics") {
      const metricsData = await metrics.getMetrics();
      return new Response(metricsData, {
        headers: { "Content-Type": metrics.getContentType() },
      });
    }

    if (url.pathname === "/healthz") {
      return new Response("OK", { status: 200 });
    }

    return new Response("Not Found", { status: 404 });
  },
});

logger.info({ port: metricsPort }, "Metrics server started");

// Start reconciler
await reconciler.start();

logger.info("Ringmaster is running");
