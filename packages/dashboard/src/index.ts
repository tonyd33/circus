#!/usr/bin/env bun

import { EnvReader as ER } from "@mnke/circus-shared/lib";
import { Either } from "@mnke/circus-shared/lib/fp";
import { createLogger } from "@mnke/circus-shared/logger";
import { serve } from "bun";
import index from "./index.html";
import { createActivityRoute } from "./routes/activity";
import { createChimpsRoutes } from "./routes/chimps";
import { createMessageRoutes } from "./routes/messages";

const logger = createLogger("Dashboard");

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
    ...createMessageRoutes(config.natsUrl),
  },

  development: process.env.NODE_ENV !== "production" && {
    hmr: true,
    console: true,
  },
});

console.log(`🚀 Server running at ${server.url}`);
