import type { Logger } from "@mnke/circus-shared";
import type { Adapter, AdapterResponse, AdapterResult } from "./types.ts";

export class DebugAdapter implements Adapter {
  constructor(private logger: Logger.Logger) {}
  async handleEvent(
    body: unknown,
    headers: Record<string, string>,
  ): Promise<AdapterResponse> {
    this.logger.info({ headers, body }, "Received test event");
    return {
      result: body as AdapterResult,
      response: new Response("ok", { status: 200 }),
    };
  }
}
