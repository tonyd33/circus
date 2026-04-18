#!/usr/bin/env bun

import * as Commander from "@commander-js/extra-typings";
import { Logger } from "@mnke/circus-shared";
import { EnvReader as ER } from "@mnke/circus-shared/lib";
import { Either as E } from "@mnke/circus-shared/lib/fp";
import { ADAPTER_REGISTRY } from "@/adapters/index.ts";
import { parseKeyValueObjectForKeys } from "@/lib/parsers.ts";
import type { RouteConfig } from "@/types.ts";
import { Usher } from "@/usher.ts";

const logger = Logger.createLogger("usher");

const parseRouteConfig = (v: string) =>
  parseKeyValueObjectForKeys(["adapter", "path"]).parse(v);

async function main() {
  const collectRoutes = (value: string, prev: RouteConfig[]): RouteConfig[] => {
    const result = parseRouteConfig(value);
    if (result.isRight()) {
      return prev.concat(result.unwrap());
    } else {
      throw new Commander.InvalidArgumentError("Failed parsing route");
    }
  };
  const program = new Commander.Command()
    .name("usher")
    .description("HTTP adapter router for circus messaging")
    .option(
      "-r, --route <value>",
      "Route config (format: adapter=slack,path=/slack)",
      collectRoutes,
      [],
    );
  program.parse(process.argv);
  const opts = program.opts();
  const routes = opts.route;
  if (routes.length === 0) {
    logger.error("No routes configured. Use --route adapter=slack,path=/slack");
    process.exit(1);
  }

  const envResult = ER.record({
    natsUrl: ER.str("NATS_URL").fallback("nats://localhost:4222"),
    port: ER.str("PORT").fallback("7392"),
  }).read(process.env).value;

  if (E.isLeft(envResult)) {
    logger.error(ER.formatReadError(envResult.value));
    process.exit(1);
  }

  const usher = new Usher(
    routes,
    envResult.value.natsUrl,
    ADAPTER_REGISTRY,
    logger.child({ component: "Usher" }),
  );

  process.on("SIGINT", () => usher.shutdown());
  process.on("SIGTERM", () => usher.shutdown());

  await usher.serve(parseInt(envResult.value.port, 10));
}

main().catch((error) => {
  logger.error({ err: error }, "Fatal error");
  process.exit(1);
});
