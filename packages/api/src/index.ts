#!/usr/bin/env bun

import { Standards } from "@mnke/circus-shared";
import { EnvReader as ER } from "@mnke/circus-shared/lib";
import { Either } from "@mnke/circus-shared/lib/fp";
import * as Logger from "@mnke/circus-shared/logger";
import { buildApp } from "./app";
import { closeDeps, initDeps } from "./deps";

const logger = Logger.createLogger("api");

async function main() {
  const result = ER.record({
    natsUrl: ER.str("NATS_URL").fallback("nats://localhost:4222"),
    databaseUrl: ER.str("DATABASE_URL").fallback(
      "postgresql://circus:circus@localhost:5432/circus",
    ),
    defaultProfile: ER.str(Standards.Profile.Env.defaultProfile),
    port: ER.int("PORT").fallback(4773),
    dashboardOrigin: ER.str("DASHBOARD_ORIGIN").fallback(
      "http://localhost:4772",
    ),
  }).read(process.env).value;

  if (Either.isLeft(result)) {
    logger.error(ER.formatReadError(result.value));
    process.exit(1);
  }

  const config = result.value;

  const deps = await initDeps(
    {
      natsUrl: config.natsUrl,
      databaseUrl: config.databaseUrl,
      defaultProfile: config.defaultProfile,
    },
    logger.child({ component: "Deps" }),
  );

  const app = buildApp(deps, { dashboardOrigin: config.dashboardOrigin });
  app.listen(config.port);
  logger.info({ port: config.port }, "API server started");

  let shuttingDown = false;
  const shutdown = async (signal: string) => {
    if (shuttingDown) return;
    shuttingDown = true;
    logger.info({ signal }, "Received shutdown signal");
    await app.stop();
    await closeDeps(deps);
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
}

main().catch((error) => {
  logger.error({ err: error }, "Fatal error");
  process.exit(1);
});
