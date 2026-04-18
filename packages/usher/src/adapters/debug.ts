import { Logger } from "@mnke/circus-shared";
import type { Adapter, AdapterResult } from "./types.ts";

const logger = Logger.createLogger("DebugAdapter");

export class DebugAdapter implements Adapter {
  async handleEvent(
    body: unknown,
    headers: Record<string, string>,
  ): Promise<AdapterResult> {
    logger.info({ headers, body }, "Received test event");

    return body as AdapterResult;
  }
}
