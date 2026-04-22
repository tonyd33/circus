#!/usr/bin/env bun

import * as Commander from "@commander-js/extra-typings";
import { Logger } from "@mnke/circus-shared";
import { EnvReader as ER } from "@mnke/circus-shared/lib";
import { Either } from "@mnke/circus-shared/lib/fp";
import type { RingmasterConfig } from "@/core/types";
import { Ringmaster } from "@/ringmaster";

const logger = Logger.createLogger("ringmaster");

async function main() {
  const program = new Commander.Command()
    .name("ringmaster")
    .description("Chimp lifecycle orchestrator")
    .option("--namespace <ns>", "Kubernetes namespace", "default")
    .parse(process.argv);

  const opts = program.opts();

  const result = ER.record({
    natsUrl: ER.str("NATS_URL").fallback("nats://localhost:4222"),
    redisUrl: ER.str("REDIS_URL").fallback("redis://localhost:6379"),
    profileTemplatePath: ER.str("PROFILE_TEMPLATE_PATH").fallbackW(undefined),
  }).read(process.env).value;

  if (Either.isLeft(result)) {
    logger.error(ER.formatReadError(result.value));
    process.exit(1);
  }

  const envConfig = result.value;

  const config: RingmasterConfig = {
    natsUrl: envConfig.natsUrl,
    redisUrl: envConfig.redisUrl,
    namespace: opts.namespace,
    profileTemplatePath: envConfig.profileTemplatePath,
  };

  logger.info({ config }, "Ringmaster starting");

  const ringmaster = new Ringmaster(
    config,
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
