import type { Logger } from "@mnke/circus-shared";
import type { Adapter, AdapterResult } from "./types.ts";

export class SlackAdapter implements Adapter {
  constructor(private logger: Logger.Logger) {}
  async handleEvent(
    body: unknown,
    headers: Record<string, string>,
  ): Promise<AdapterResult> {
    this.logger.info({ headers }, "Received Slack event");

    const prompt = JSON.stringify(body);

    return {
      chimpId: "stub",
      command: {
        command: "send-agent-message",
        args: { prompt },
      },
    };
  }
}
