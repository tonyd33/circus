/**
 * Circus Bullhorn
 *
 * Output handler for chimp messages - announces chimp outputs to the world
 * (Slack, GitHub, Discord, console logging, etc.)
 */

import { createLogger } from "@mnke/circus-shared/logger";
import { Bullhorn } from "./bullhorn.ts";

const logger = createLogger("bullhorn");

async function main() {
  // Create bullhorn instance
  const bullhorn = new Bullhorn({ logger });

  // Handle graceful shutdown
  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}, shutting down...`);
    await bullhorn.cleanup();
    process.exit(0);
  };

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  // Start bullhorn (this will run indefinitely)
  logger.info("Starting Bullhorn...");
  await bullhorn.initialize();

  // Start metrics server
  const metricsPort = parseInt(process.env.METRICS_PORT || "9090", 10);
  await bullhorn.startMetricsServer(metricsPort);

  await bullhorn.start();
}

main();
