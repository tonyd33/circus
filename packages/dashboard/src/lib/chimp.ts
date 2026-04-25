import type { Protocol, Standards } from "@mnke/circus-shared";

export type ChimpState = Standards.Chimp.ChimpState & { profile: string };
export type ChimpStatus = Standards.Chimp.ChimpStatus;

export type ActivityEvent =
  | {
      id: string;
      type: "event";

      timestamp: string;
      data: Protocol.ChimpCommand;
    }
  | {
      id: string;
      type: "output";

      timestamp: string;
      data: Protocol.ChimpOutputMessage;
    }
  | {
      id: string;
      type: "meta";

      timestamp: string;
      data: Protocol.MetaEvent;
    }
  | {
      id: string;
      type: "unknown";

      timestamp: string;
      data: unknown;
    };

export async function fetchChimps(): Promise<ChimpState[]> {
  const res = await fetch("/api/chimps");
  if (!res.ok) {
    throw new Error(`Failed to fetch chimps: ${res.status}`);
  }
  const data = await res.json();
  return data.chimps;
}
