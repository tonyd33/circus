import type { Standards } from "@mnke/circus-shared";
import { api } from "./api";

export type ChimpState = Standards.Chimp.ChimpState & {
  profile: string;
  topics?: Standards.Topic.Topic[];
};
export type ChimpStatus = Standards.Chimp.ChimpStatus;
export type ActivityEvent = Standards.Activity.ActivityEvent;

export async function fetchChimps(): Promise<ChimpState[]> {
  const { data, error } = await api.api.chimps.get();
  if (error) throw new Error(`Failed to fetch chimps: ${error.status}`);
  return data.chimps;
}
