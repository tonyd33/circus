import type { ChimpCommand } from "@mnke/circus-shared/protocol";
import { ChimpBrain, type PublishFn } from "@/chimp-brain";

export class EchoBrain extends ChimpBrain {
  constructor(chimpId: string, publish: PublishFn) {
    super(chimpId, publish);
  }

  async handleMessage(command: ChimpCommand): Promise<"continue" | "stop"> {
    await new Promise((resolve) => setTimeout(resolve, 1000));
    this.log("info", `Echo: ${command.command}`);
    if (command.command === "stop") return "stop";
    return "continue";
  }

  async onStartup(): Promise<void> {}

  async onShutdown(): Promise<void> {}
}
