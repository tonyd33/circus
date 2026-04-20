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
    natsUrl: ER.str("NATS_URL").fallback("nats://localhost:4222"),
    metricsPort: ER.int("METRICS_PORT").fallback(9090),
    githubAppId: ER.str("GITHUB_APP_ID"),
    githubPrivateKey: ER.str("GITHUB_PRIVATE_KEY"),
  }).read(process.env).value;

  if (Either.isLeft(result)) {
    logger.error(ER.formatReadError(result.value));
    process.exit(1);
  }

  const config = result.value;

  const bullhorn = new Bullhorn({
    logger: logger.child({ component: "Bullhorn" }),
    natsUrl: config.natsUrl,
    githubAppId: config.githubAppId,
    githubPrivateKey: config.githubPrivateKey,
  });

  const shutdown = (signal: string) => async () => {
    logger.info({ signal }, "Received shutdown signal");
    await bullhorn.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown("SIGINT"));
  process.on("SIGTERM", shutdown("SIGTERM"));

  logger.info("Starting Bullhorn...");
  await bullhorn.initialize();

  await bullhorn.startMetricsServer(config.metricsPort);

  await bullhorn.start();
}

main().catch((error) => {
  logger.error({ err: error }, "Fatal error");
  process.exit(1);
});
