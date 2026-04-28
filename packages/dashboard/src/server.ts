#!/usr/bin/env bun

import path from "node:path";
import { EnvReader as ER } from "@mnke/circus-shared/lib";
import { Either } from "@mnke/circus-shared/lib/fp";
import * as Logger from "@mnke/circus-shared/logger";

const logger = Logger.createLogger("dashboard");

async function main() {
  const result = ER.record({
    port: ER.int("PORT").fallback(4772),
    apiUrl: ER.str("API_URL").fallback(""),
    distDir: ER.str("DIST_DIR").fallback(
      path.resolve(import.meta.dir, "..", "dist"),
    ),
  }).read(process.env).value;

  if (Either.isLeft(result)) {
    logger.error(ER.formatReadError(result.value));
    process.exit(1);
  }

  const { port, apiUrl, distDir } = result.value;

  const indexHtmlPath = path.join(distDir, "index.html");
  const rawHtml = await Bun.file(indexHtmlPath).text();
  const indexHtml = rawHtml.replace(
    /window\.__API_URL__\s*=\s*"[^"]*"/,
    `window.__API_URL__ = ${JSON.stringify(apiUrl)}`,
  );

  const server = Bun.serve({
    port,
    async fetch(req) {
      const url = new URL(req.url);
      if (url.pathname === "/healthz") {
        return new Response("OK");
      }
      const filePath = path.join(distDir, url.pathname);
      const file = Bun.file(filePath);
      if (
        url.pathname !== "/" &&
        !url.pathname.endsWith("/") &&
        (await file.exists())
      ) {
        return new Response(file);
      }
      return new Response(indexHtml, {
        headers: { "content-type": "text/html; charset=utf-8" },
      });
    },
  });

  logger.info(
    { url: server.url.toString(), apiUrl },
    "Dashboard server started",
  );

  const shutdown = (signal: string) => {
    logger.info({ signal }, "Received shutdown signal");
    server.stop();
    process.exit(0);
  };
  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));
}

main().catch((error) => {
  logger.error({ err: error }, "Fatal error");
  process.exit(1);
});
