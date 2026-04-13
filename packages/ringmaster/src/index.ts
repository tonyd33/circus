#!/usr/bin/env bun

import { Standards } from "@mnke/circus-shared";
import { EnvReader } from "@mnke/circus-shared/lib";
import { Either } from "@mnke/circus-shared/lib/fp";
import { createLogger } from "@mnke/circus-shared/logger";
import type { RingmasterConfig } from "./core/types.ts";
import { loadChimpJobConfig } from "./lib/chimp-job-config.ts";
import { Ringmaster } from "./ringmaster.ts";

const logger = createLogger("Ringmaster");

let ringmaster: Ringmaster | null = null;

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
  const result = EnvReader.record({
    natsUrl: EnvReader.str("NATS_URL").fallback("nats://localhost:4222"),
    redisUrl: EnvReader.str("REDIS_URL").fallback("redis://localhost:6379"),
    namespace: EnvReader.str("NAMESPACE").fallback("default"),
    chimpImage: EnvReader.str("CHIMP_IMAGE").fallback("circus-chimp"),
    chimpBrainType: EnvReader.str(Standards.Chimp.Env.brainType).fallback(
      "echo",
    ),
    chimpJobConfigPath: EnvReader.str("CHIMP_JOB_CONFIG_PATH").fallback(""),
  }).read(process.env).value;

  if (Either.isLeft(result)) {
    logger.error(EnvReader.formatReadError(result.value));
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

  const port = parseInt(process.env.PORT || "3000", 10);
  const server = Bun.serve({
    port,
    routes: {
      "/health": async (req) => {
        const health = await ringmaster!.checkHealth();
        return new Response(JSON.stringify(health), {
          status: health.ok ? 200 : 503,
          headers: { "Content-Type": "application/json" },
        });
      },
      "/health/live": () => {
        return new Response(null, { status: 200 });
      },
    },
  });

  logger.info(`Health server running on port ${server.port}`);
}

main().catch((error) => {
  logger.error({ err: error }, "Fatal error");
  process.exit(1);
});
