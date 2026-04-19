import type { Standards } from "@mnke/circus-shared";

export type ChimpState = Standards.Chimp.ChimpState;
export type ChimpStatus = Standards.Chimp.ChimpStatus;

export async function fetchChimps(): Promise<ChimpState[]> {
  const res = await fetch("/api/chimps");
  if (!res.ok) {
    throw new Error(`Failed to fetch chimps: ${res.status}`);
  }
  const data = await res.json();
  return data.chimps;
}
