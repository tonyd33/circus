#!/usr/bin/env bun

import { Logger, Standards } from "@mnke/circus-shared";
import { EnvReader as ER } from "@mnke/circus-shared/lib";
import { Either } from "@mnke/circus-shared/lib/fp";
import { Chimp } from "./chimp";
import {
  ClaudeChimp,
  EchoBrain,
  OpencodeBrain,
  type PublishFn,
} from "./chimp-brain";

const logger = Logger.createLogger("chimp");

async function main() {
  const result = ER.record({
    chimpId: ER.str(Standards.Chimp.Env.chimpId),
    profile: ER.str(Standards.Chimp.Env.profile).fallback("default"),
    model: ER.str(Standards.Chimp.Env.model).fallback("big-pickle"),
    natsUrl: ER.str(Standards.Chimp.Env.natsUrl).fallback(
      "nats://localhost:4222",
    ),
    brainType: ER.enm(Standards.Chimp.Env.brainType, [
      "claude",
      "opencode",
      "echo",
    ]).fallback("echo"),
    inputMode: ER.enm(Standards.Chimp.Env.inputMode, ["nats", "http"]).fallback(
      "nats",
    ),
    outputMode: ER.enm(Standards.Chimp.Env.outputMode, [
      "nats",
      "stdout",
    ]).fallback("nats"),
    httpPort: ER.int(Standards.Chimp.Env.httpPort).fallback(5928),
  }).read(process.env).value;

  if (Either.isLeft(result)) {
    logger.error(ER.formatReadError(result.value));
    process.exit(1);
  }

  const config = result.value;

  logger.info(
    {
      chimpId: config.chimpId,
      inputMode: config.inputMode,
      outputMode: config.outputMode,
    },
    "Starting Chimp",
  );

  const brainFactory = (
    chimpId: string,
    model: string,
    publish: PublishFn,
    brainLogger: Logger.Logger,
  ) => {
    switch (config.brainType) {
      case "claude":
        return new ClaudeChimp(chimpId, model, publish, brainLogger);
      case "opencode":
        return new OpencodeBrain(chimpId, model, publish, brainLogger);
      case "echo":
        return new EchoBrain(chimpId, model, publish, brainLogger);
      default:
        throw new Error(`Unknown brain type: ${config.brainType}`);
    }
  };

  const runtime = new Chimp(
    {
      chimpId: config.chimpId,
      profile: config.profile,
      model: config.model,
      natsUrl: config.natsUrl,
      inputMode: config.inputMode,
      outputMode: config.outputMode,
      httpPort: config.httpPort,
      idleTimeoutMs: 5 * 60 * 1000,
      logger: logger.child({ component: "Chimp" }),
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
