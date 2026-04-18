#!/usr/bin/env bun

import { Logger } from "@mnke/circus-shared";
import { EnvReader as ER } from "@mnke/circus-shared/lib";
import { Either } from "@mnke/circus-shared/lib/fp";
import { serve } from "bun";
import index from "./index.html";
import { createActivityRoute } from "./routes/activity";
import { createChimpsRoutes } from "./routes/chimps";
import { MessageRouter } from "./routes/messages";

const logger = Logger.createLogger("Dashboard");

interface Config {
  ledgerUrl: string;
  natsUrl: string;
}

function getConfig(): Config {
  const result = ER.record({
    ledgerUrl: ER.str("LEDGER_URL").fallback("http://localhost:6489"),
    natsUrl: ER.str("NATS_URL").fallback("nats://localhost:4222"),
  }).read(process.env).value;

  if (Either.isLeft(result)) {
    logger.error(ER.formatReadError(result.value));
    process.exit(1);
  }

  return result.value;
}

const config = getConfig();

const messageRouter = new MessageRouter(config.natsUrl);
await messageRouter.initialize();

const shutdown = async (signal: string) => {
  logger.info(`Received ${signal}, shutting down...`);
  await messageRouter.cleanup();
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

async function proxyToLedger(path: string): Promise<Response> {
  const res = await fetch(`${config.ledgerUrl}${path}`);
  return new Response(res.body, {
    status: res.status,
    headers: { "Content-Type": "application/json" },
  });
}

const server = serve({
  routes: {
    "/*": index,
    "/api/chimp/:chimpId/activity": createActivityRoute(config.natsUrl),
    ...createChimpsRoutes(proxyToLedger),
    ...messageRouter.routes,
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

logger.info({ url: server.url.toString() }, "Dashboard server started");
