import type { Logger, Protocol } from "@mnke/circus-shared";
import { ChimpBrain, type PublishFn } from "../chimp-brain";

export class EchoBrain extends ChimpBrain {
  constructor(
    chimpId: string,
    model: string,
    publish: PublishFn,
    logger: Logger.Logger,
  ) {
    super(chimpId, model, publish, logger);
  }

  async handleMessage(
    command: Protocol.ChimpCommand,
  ): Promise<"continue" | "stop"> {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    this.log("info", `Echo: ${command.command}`);
    if (command.command === "stop") return "stop";
    return "continue";
  }

  async onStartup(): Promise<void> {}

  async onShutdown(): Promise<void> {}
}
