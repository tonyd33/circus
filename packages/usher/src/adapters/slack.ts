import type * as Logger from "@mnke/circus-shared/logger";
import type { Adapter, AdapterResponse } from "./types.ts";

export class SlackAdapter implements Adapter {
  constructor(private logger: Logger.Logger) {}
  async handleEvent(
    _body: unknown,
    headers: Record<string, string>,
  ): Promise<AdapterResponse> {
    this.logger.info({ headers }, "Received Slack event");

    const prompt = JSON.stringify(_body);

    return {
      result: {
        eventSubject: "events.slack.stub",
        command: {
          command: "send-agent-message",
          args: { prompt },
        },
      },
      response: new Response("ok", { status: 200 }),
    };
  }
}
