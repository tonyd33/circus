import { Loader2, Plus } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  type ChimpProfile,
  fetchProfiles,
  type ProfileMap,
  saveProfile,
} from "./profiles/api";
import { ProfileEditor } from "./profiles/ProfileEditor";

export function Profiles() {
  const [profiles, setProfiles] = useState<ProfileMap>({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [creating, setCreating] = useState(false);

  const load = useCallback(async () => {
    try {
      const data = await fetchProfiles();
      setProfiles(data);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load profiles");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function handleCreate() {
    const name = newName.trim();
    if (!name) return;
    setCreating(true);
    setError(null);
    try {
      const empty: ChimpProfile = {
        brain: "echo",
        model: "",
        image: "",
        extraEnv: [],
        volumeMounts: [],
        volumes: [],
        initCommands: [],
      };
      await saveProfile(name, empty);
      setNewName("");
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Create failed");
    } finally {
      setCreating(false);
    }
  }

  if (loading) {
    return (
      <div className="container mx-auto p-8 flex justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-8">
      <div className="flex items-end justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold">Profiles</h1>
          <p className="text-muted-foreground">
            Configure chimp profiles. Changes take effect on next job creation.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="New profile name"
            className="w-48"
            onKeyDown={(e) => {
              if (e.key === "Enter" && newName.trim()) {
                handleCreate();
              }
            }}
          />
          <Button
            disabled={creating || !newName.trim()}
            className="gap-2"
            onClick={handleCreate}
          >
            {creating ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Plus className="h-4 w-4" />
            )}
            Create
          </Button>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          {error}
        </div>
      )}

      <div className="space-y-6">
        {Object.entries(profiles).map(([name, profile]) => (
          <ProfileEditor
            key={name}
            name={name}
            profile={profile}
            onSaved={load}
          />
        ))}
      </div>

      {Object.keys(profiles).length === 0 && !error && (
        <p className="text-muted-foreground">No profiles configured.</p>
      )}
    </div>
  );
}
