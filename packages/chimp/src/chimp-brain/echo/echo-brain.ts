import type { Protocol } from "@mnke/circus-shared";
import { ChimpBrain } from "../chimp-brain";

export class EchoBrain extends ChimpBrain {
  async handleMessage(
    command: Protocol.ChimpCommand,
  ): Promise<"continue" | "stop"> {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    this.log("info", `Echo: ${command.command}`);
    if (command.command === "stop") return "stop";
    if (command.command === "set-system-prompt")
      this.setSystemPrompt(command.args.prompt);
    if (command.command === "set-allowed-tools")
      this.setAllowedTools(command.args.tools);
    return "continue";
  }

  async onStartup(): Promise<void> {}

  async onShutdown(): Promise<void> {}
}
