import { Protocol, Standards } from "@mnke/circus-shared";
import type * as Logger from "@mnke/circus-shared/logger";
import type { Adapter, AdapterResponse } from "./types.ts";

export class DebugAdapter implements Adapter {
  constructor(private logger: Logger.Logger) {}
  async handleEvent(
    body: unknown,
    _headers: Record<string, string>,
  ): Promise<AdapterResponse> {
    this.logger.info({ body }, "Received debug event");

    const payload = body as { prompt?: string; subject?: string };
    const prompt = payload.prompt ?? "debug message";
    const subject =
      payload.subject ??
      Standards.Topic.buildEventSubject(
        { platform: "debug", sessionId: crypto.randomUUID().slice(0, 8) },
        "message",
      );

    return {
      result: {
        eventSubject: subject,
        command: Protocol.createAgentCommand(prompt),
      },
      response: new Response("ok", { status: 200 }),
    };
  }
}
