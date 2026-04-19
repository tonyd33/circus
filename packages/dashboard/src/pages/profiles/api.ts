import type { Protocol } from "@mnke/circus-shared";

export type ChimpProfile = Protocol.ChimpProfile;
export type ProfileMap = Record<string, ChimpProfile>;

export async function fetchProfiles(): Promise<ProfileMap> {
  const res = await fetch("/api/profiles");
  if (!res.ok) throw new Error(`Failed to fetch profiles: ${res.status}`);
  const data = await res.json();
  return data.profiles;
}

export async function saveProfile(
  name: string,
  profile: ChimpProfile,
): Promise<void> {
  const res = await fetch(`/api/profiles/${name}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(profile),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(
      body.error?.formErrors?.[0] || `Save failed: ${res.status}`,
    );
  }
}

export async function deleteProfile(name: string): Promise<void> {
  const res = await fetch(`/api/profiles/${name}`, { method: "DELETE" });
  if (!res.ok) throw new Error(`Delete failed: ${res.status}`);
}
