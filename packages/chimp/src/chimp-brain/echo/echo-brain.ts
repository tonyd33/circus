import { ChimpBrain, type CommandResult } from "../chimp-brain";

export class EchoBrain extends ChimpBrain {
  async handlePrompt(prompt: string): Promise<CommandResult> {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    this.log("info", `Echo: ${prompt}`);
    return "continue";
  }

  async onStartup(): Promise<void> {}

  async onShutdown(): Promise<void> {}
}
