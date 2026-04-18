import type { Protocol } from "@mnke/circus-shared";

export interface AdapterResult {
  chimpId: string;
  command: Protocol.ChimpCommand;
}

export interface Adapter {
  handleEvent(
    body: unknown,
    headers: Record<string, string>,
  ): Promise<AdapterResult>;
}
