import type { Logger } from "@mnke/circus-shared";
import type { Adapter, AdapterResult } from "./types.ts";

export class DebugAdapter implements Adapter {
  constructor(private logger: Logger.Logger) {}
  async handleEvent(
    body: unknown,
    headers: Record<string, string>,
  ): Promise<AdapterResult> {
    this.logger.info({ headers, body }, "Received test event");

    return body as AdapterResult;
  }
}
