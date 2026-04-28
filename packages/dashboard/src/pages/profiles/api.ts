import type { Protocol } from "@mnke/circus-shared";
import { api } from "@/lib/api";

export type ChimpProfile = Protocol.ChimpProfile;
export type ProfileMap = Record<string, ChimpProfile>;

export async function fetchProfiles(): Promise<ProfileMap> {
  const { data, error } = await api.api.profiles.get();
  if (error) throw new Error(`Failed to fetch profiles: ${error.status}`);
  return data.profiles;
}

export async function saveProfile(
  name: string,
  profile: ChimpProfile,
): Promise<void> {
  const { error } = await api.api.profiles({ name }).put(profile);
  if (error) {
    throw new Error(`Save failed: ${error.status}`);
  }
}

export async function deleteProfile(name: string): Promise<void> {
  const { error } = await api.api.profiles({ name }).delete();
  if (error) throw new Error(`Delete failed: ${error.status}`);
}
