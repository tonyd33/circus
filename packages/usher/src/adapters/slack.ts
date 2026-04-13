import { createLogger } from "@mnke/circus-shared/logger";
import type { Adapter, AdapterResult } from "./types.ts";

const logger = createLogger("SlackAdapter");

export class SlackAdapter implements Adapter {
  async handleEvent(
    body: unknown,
    headers: Record<string, string>,
  ): Promise<AdapterResult> {
    logger.info({ headers }, "Received Slack event");

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
