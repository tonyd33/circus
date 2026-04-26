import { ProfileCompiler } from "@mnke/circus-shared/lib";
import { FileUp, Loader2, Plus, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
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
  const fileInputRef = useRef<HTMLInputElement>(null);
  const templateInputRef = useRef<HTMLInputElement>(null);

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
        provider: "",
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

  async function handleImport(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const data = JSON.parse(text) as ChimpProfile;
      const name = file.name.replace(/\.profile\.json$|\.json$/, "");
      await saveProfile(name, data);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Import failed");
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  async function handleImportTemplate(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const text = await file.text();
      const template: ProfileCompiler.ProfileTemplate = JSON.parse(text);
      const compiled = ProfileCompiler.compileProfiles(template);
      for (const [name, profile] of Object.entries(compiled)) {
        await saveProfile(name, profile);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Template import failed");
    }
    if (templateInputRef.current) templateInputRef.current.value = "";
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
          <h1 className="text-3xl font-bold text-circus-crimson">
            🎩 Profiles
          </h1>
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
          <input
            ref={fileInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImport}
          />
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => fileInputRef.current?.click()}
          >
            <Upload className="h-4 w-4" />
            Import
          </Button>
          <input
            ref={templateInputRef}
            type="file"
            accept=".json"
            className="hidden"
            onChange={handleImportTemplate}
          />
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => templateInputRef.current?.click()}
          >
            <FileUp className="h-4 w-4" />
            Import Template
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
