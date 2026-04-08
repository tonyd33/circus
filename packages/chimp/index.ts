/**
 * Conduit Chimp - Claude Agent Integration
 *
 * This application connects a Claude AI agent to a NATS JetStream
 * via the Conduit operator, allowing the agent to process messages
 * and respond with AI-generated content using the Claude Agent SDK.
 */

import { createLogger } from "@mnke/circus-shared/logger";
import { runtime, startup } from "./lifecycle";

const logger = createLogger("Chimp");

/**
 * Main entry point - orchestrates startup, runtime, and shutdown
 */
async function main() {
  const {
    nc,
    chimpName,
    state,
    metrics,
    hooks,
    heartbeatIntervalRef,
    subjects,
  } = await startup();
  const metricsPort = parseInt(process.env.METRICS_PORT || "9092", 10);
  await runtime(
    nc,
    chimpName,
    state,
    metrics,
    hooks,
    heartbeatIntervalRef,
    subjects,
    metricsPort,
  );
}

// Run the application
main().catch((error) => {
  logger.error({ err: error }, "Fatal error");
  process.exit(1);
});
