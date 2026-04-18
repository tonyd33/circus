/**
 * Circus Bullhorn
 *
 * Output handler for chimp messages - announces chimp outputs to the world
 * (Slack, GitHub, Discord, console logging, etc.)
 */

import { Logger } from "@mnke/circus-shared";
import { EnvReader as ER } from "@mnke/circus-shared/lib";
import { Either } from "@mnke/circus-shared/lib/fp";
import { Bullhorn } from "./bullhorn.ts";

const logger = Logger.createLogger("bullhorn");

async function main() {
  const result = ER.record({
    natsUrl: ER.str("BULLHORN_NATS_URL").fallback("nats://localhost:4222"),
    metricsPort: ER.int("BULLHORN_METRICS_PORT").fallback(9090),
  }).read(process.env).value;

  if (Either.isLeft(result)) {
    logger.error(ER.formatReadError(result.value));
    process.exit(1);
  }

  const config = result.value;

  const bullhorn = new Bullhorn({ logger, natsUrl: config.natsUrl });

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    await bullhorn.cleanup();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  logger.info("Starting Bullhorn...");
  await bullhorn.initialize();

  await bullhorn.startMetricsServer(config.metricsPort);

  await bullhorn.start();
}

main();
