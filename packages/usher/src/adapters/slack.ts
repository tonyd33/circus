import type { Logger } from "@mnke/circus-shared";
import type { Adapter, AdapterResponse } from "./types.ts";

export class SlackAdapter implements Adapter {
  constructor(private logger: Logger.Logger) {}
  async handleEvent(
    body: unknown,
    headers: Record<string, string>,
  ): Promise<AdapterResponse> {
    this.logger.info({ headers }, "Received Slack event");

    const prompt = JSON.stringify(body);

    return {
      result: {
        eventSubject: "events.slack.stub",
        defaultProfile: "default",
        command: {
          command: "send-agent-message",
          args: { prompt },
        },
      },
      response: new Response("ok", { status: 200 }),
    };
  }
}
