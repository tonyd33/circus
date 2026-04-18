#!/usr/bin/env bun

import * as Commander from "@commander-js/extra-typings";
import { Logger, Standards } from "@mnke/circus-shared";
import { EnvReader as ER } from "@mnke/circus-shared/lib";
import { Either } from "@mnke/circus-shared/lib/fp";
import { createProfileLoader } from "./config/profile-loader.ts";
import type { RingmasterConfig } from "./core/types.ts";
import { loadChimpJobConfig } from "./lib/chimp-job-config.ts";
import { Ringmaster } from "./ringmaster.ts";

const logger = Logger.createLogger("ringmaster");

async function main() {
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
    logger.child({ component: "ProfileLoader" }),
  );

  const config: RingmasterConfig = {
    natsUrl: opts.natsUrl,
    redisUrl: opts.redisUrl,
    namespace: opts.namespace,
    chimpImage: opts.chimpImage,
    chimpJobConfig,
  };

  logger.info({ config, profileFile }, "Ringmaster starting");

  const ringmaster = new Ringmaster(
    config,
    profileLoader,
    logger.child({ component: "Ringmaster" }),
  );

  const shutdown = (signal: string) => async () => {
    logger.info({ signal }, "Received shutdown signal");
    await ringmaster.stop();
    process.exit(0);
  };
  process.on("SIGINT", shutdown("SIGINT"));
  process.on("SIGTERM", shutdown("SIGTERM"));

  await ringmaster.start();
}

main().catch((error) => {
  logger.error({ err: error }, "Fatal error");
  process.exit(1);
});
