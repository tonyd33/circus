#!/usr/bin/env bun

import { Standards } from "@mnke/circus-shared";
import { EnvReader as ER } from "@mnke/circus-shared/lib";
import { Either } from "@mnke/circus-shared/lib/fp";
import * as Logger from "@mnke/circus-shared/logger";
import { Dashboard } from "./dashboard";

const logger = Logger.createLogger("dashboard");

async function main() {
  const result = ER.record({
    redisUrl: ER.str("REDIS_URL").fallback("redis://localhost:6379"),
    natsUrl: ER.str("NATS_URL").fallback("nats://localhost:4222"),
    databaseUrl: ER.str("DATABASE_URL").fallback(
      "postgresql://circus:circus@localhost:5432/circus",
    ),
    defaultProfile: ER.str(Standards.Profile.Env.defaultProfile),
    port: ER.int("PORT").fallback(4772),
  }).read(process.env).value;

  if (Either.isLeft(result)) {
    logger.error(ER.formatReadError(result.value));
    process.exit(1);
  }

  const dashboard = new Dashboard(
    result.value,
    logger.child({ component: "Dashboard" }),
  );

  const shutdown = async (signal: string) => {
    logger.info({ signal }, "Received shutdown signal");
    await dashboard.stop();
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

  await dashboard.start();
}

main().catch((error) => {
  logger.error({ err: error }, "Fatal error");
  process.exit(1);
});
