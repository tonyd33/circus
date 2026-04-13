#!/usr/bin/env bun

import { Standards } from "@mnke/circus-shared";
import { EnvReader as ER } from "@mnke/circus-shared/lib";
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

  logger.info("Ringmaster is running");
}

main().catch((error) => {
  logger.error({ err: error }, "Fatal error");
  process.exit(1);
});
