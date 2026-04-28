#!/usr/bin/env bun

import { EnvReader as ER } from "@mnke/circus-shared/lib";
import { Either } from "@mnke/circus-shared/lib/fp";
import * as Logger from "@mnke/circus-shared/logger";
import { Dashboard } from "./dashboard";

const logger = Logger.createLogger("dashboard");

async function main() {
  const result = ER.record({
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
