import type { Logger } from "@mnke/circus-shared";
import { Protocol, Standards } from "@mnke/circus-shared";
import type { Adapter, AdapterResponse } from "./types.ts";

export class DebugAdapter implements Adapter {
  constructor(private logger: Logger.Logger) {}
  async handleEvent(
    body: unknown,
    _headers: Record<string, string>,
  ): Promise<AdapterResponse> {
    this.logger.info({ body }, "Received debug event");

    const payload = body as { prompt?: string; profile?: string };
    const prompt = payload.prompt ?? "debug message";
    const profile = payload.profile ?? "default";
    const id = crypto.randomUUID().slice(0, 8);

    return {
      result: {
        eventSubject: `${Standards.Chimp.Prefix.EVENTS}.debug.${id}`,
        defaultProfile: profile,
        command: Protocol.createAgentCommand(prompt),
      },
      response: new Response("ok", { status: 200 }),
    };
  }
}
