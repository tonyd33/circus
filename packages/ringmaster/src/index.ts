#!/usr/bin/env bun

import * as Commander from "@commander-js/extra-typings";
import { Logger, Standards } from "@mnke/circus-shared";
import { EnvReader as ER } from "@mnke/circus-shared/lib";
import { Either } from "@mnke/circus-shared/lib/fp";
import { createProfileLoader } from "./config/profile-loader.ts";
import type { RingmasterConfig } from "./core/types.ts";
import { loadChimpJobConfig } from "./lib/chimp-job-config.ts";
import { Ringmaster } from "./ringmaster.ts";

const program = new Commander.Command()
  .name("ringmaster")
  .description("Chimp lifecycle orchestrator")
  .option("-f, --profile-file <path>", "Path to profiles JSON file")
  .option(
    "-n, --nats-url <url>",
    "NATS connection URL",
    "nats://localhost:4222",
  )
  .option(
    "-r, --redis-url <url>",
    "Redis connection URL",
    "redis://localhost:6379",
  )
  .option("--namespace <ns>", "Kubernetes namespace", "default")
  .option("--chimp-image <image>", "Chimp container image", "circus-chimp")
  .parse(process.argv);

const opts = program.opts();

const logger = Logger.createLogger("Ringmaster");

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
  const profileFile = opts.profileFile;

  const result = ER.record({
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

  const profileLoader = await createProfileLoader(
    profileFile ?? "/etc/circus/ringmaster/profiles.json",
  );

  const config: RingmasterConfig = {
    natsUrl: opts.natsUrl,
    redisUrl: opts.redisUrl,
    namespace: opts.namespace,
    chimpImage: opts.chimpImage,
    chimpJobConfig,
  };

  logger.info({ config, profileFile }, "Ringmaster starting");

  ringmaster = new Ringmaster(config, profileLoader);

  await ringmaster.start();

  logger.info("Ringmaster is running");
}

main().catch((error) => {
  logger.error({ err: error }, "Fatal error");
  process.exit(1);
});
