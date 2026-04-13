#!/usr/bin/env bun

import { Standards } from "@mnke/circus-shared";
import { EnvReader as ER } from "@mnke/circus-shared/lib";
import { Either } from "@mnke/circus-shared/lib/fp";
import { createLogger } from "@mnke/circus-shared/logger";
import { Chimp } from "./chimp";
import {
  ClaudeChimp,
  EchoBrain,
  OpencodeBrain,
  type PublishFn,
} from "./chimp-brain";

const logger = createLogger("Chimp");

async function main() {
  const result = ER.record({
    chimpId: ER.str(Standards.Chimp.Env.chimpId),
    natsUrl: ER.str(Standards.Chimp.Env.natsUrl).fallback(
      "nats://localhost:4222",
    ),
    brainType: ER.str(Standards.Chimp.Env.brainType).fallback("echo"),
    inputMode: ER.str(Standards.Chimp.Env.inputMode).fallback("nats"),
    outputMode: ER.str(Standards.Chimp.Env.outputMode).fallback("nats"),
    httpPort: ER.int(Standards.Chimp.Env.httpPort).fallback(5928),
  }).read(process.env).value;

  if (Either.isLeft(result)) {
    logger.error(ER.formatReadError(result.value));
    process.exit(1);
  }

  const config = result.value;

  // Validate input/output modes
  if (config.inputMode !== "nats" && config.inputMode !== "http") {
    logger.error(
      `Invalid input mode: ${config.inputMode}. Use "nats" or "http"`,
    );
    process.exit(1);
  }
  if (config.outputMode !== "nats" && config.outputMode !== "stdout") {
    logger.error(
      `Invalid output mode: ${config.outputMode}. Use "nats" or "stdout"`,
    );
    process.exit(1);
  }

  logger.info(
    {
      chimpId: config.chimpId,
      inputMode: config.inputMode,
      outputMode: config.outputMode,
    },
    "Starting Chimp",
  );

  const brainFactory = (chimpId: string, publish: PublishFn) => {
    switch (config.brainType) {
      case "claude":
        return new ClaudeChimp(chimpId, publish);
      case "opencode":
        return new OpencodeBrain(chimpId, publish);
      case "echo":
        return new EchoBrain(chimpId, publish);
      default:
        throw new Error(`Unknown brain type: ${config.brainType}`);
    }
  };

  const runtime = new Chimp(
    {
      chimpId: config.chimpId,
      natsUrl: config.natsUrl,
      inputMode: config.inputMode as "nats" | "http",
      outputMode: config.outputMode as "nats" | "stdout",
      httpPort: config.httpPort,
      idleTimeoutMs: 5 * 60 * 1000,
    },
    brainFactory,
  );

  await runtime.start();

  logger.info("Chimp is running");
}

main().catch((error) => {
  logger.error({ err: error }, "Fatal error");
  process.exit(1);
});
