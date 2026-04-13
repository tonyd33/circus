import type { ChimpCommand } from "@mnke/circus-shared/protocol";

export interface AdapterResult {
  chimpId: string;
  command: ChimpCommand;
}

export interface Adapter {
  handleEvent(
    body: unknown,
    headers: Record<string, string>,
  ): Promise<AdapterResult>;
}
