import type { Protocol } from "@mnke/circus-shared";

export interface AdapterResult {
  eventSubject: string;
  command: Protocol.ChimpCommand;
}

export interface AdapterResponse {
  result: AdapterResult | null;
  response: Response;
}

export interface Adapter {
  handleEvent(
    body: unknown,
    headers: Record<string, string>,
  ): Promise<AdapterResponse>;
}
