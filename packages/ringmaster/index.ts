#!/usr/bin/env bun
/**
 * Ringmaster - Main Entry Point
 *
 * Manages Chimp lifecycle (pods + NATS streams)
 */

import Redis from "ioredis";
import {
  validateRequiredEnv,
  getEnv,
  getEnvInt,
} from "@mnke/circus-shared/config";
import { createLogger } from "@mnke/circus-shared/logger";
import { Reconciler } from "./reconciler.ts";
import type { RingmasterConfig } from "./types.ts";

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

// Connect to Redis
const redis = new Redis(config.redisUrl);

// Create reconciler
const reconciler = new Reconciler(config, redis);

// Handle shutdown gracefully
const shutdown = async (signal: string) => {
  logger.info({ signal }, "Shutting down");
  await reconciler.stop();
  process.exit(0);
};

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

// Start reconciler
await reconciler.start();

logger.info("Ringmaster is running");
