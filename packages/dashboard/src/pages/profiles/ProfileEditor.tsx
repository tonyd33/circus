import type { Protocol } from "@mnke/circus-shared";
import { Loader2, Plus, Save, Trash2 } from "lucide-react";
import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { type ChimpProfile, deleteProfile, saveProfile } from "./api";
import { CommandEditor, newCommand } from "./CommandEditor";
import { type EnvVar, EnvVarEditor } from "./EnvVarEditor";

type ChimpCommand = Protocol.ChimpCommand;

export function ProfileEditor({
  name,
  profile,
  onSaved,
}: {
  name: string;
  profile: ChimpProfile;
  onSaved: () => void;
}) {
  const [brain, setBrain] = useState(profile.brain);
  const [model, setModel] = useState(profile.model);
  const [image, setImage] = useState(profile.image);
  const [description, setDescription] = useState(profile.description ?? "");
  const [imagePullPolicy, setImagePullPolicy] = useState(
    profile.imagePullPolicy ?? "",
  );
  const [extraEnv, setExtraEnv] = useState<EnvVar[]>(
    profile.extraEnv as EnvVar[],
  );
  const [volumeMountsJson, setVolumeMountsJson] = useState(
    JSON.stringify(profile.volumeMounts, null, 2),
  );
  const [volumesJson, setVolumesJson] = useState(
    JSON.stringify(profile.volumes, null, 2),
  );
  const [initCommands, setInitCommands] = useState<ChimpCommand[]>(
    profile.initCommands as ChimpCommand[],
  );
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  async function handleSave() {
    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const updated: ChimpProfile = {
        brain,
        model,
        image,
        ...(description && { description }),
        ...(imagePullPolicy && { imagePullPolicy }),
        extraEnv,
        volumeMounts: JSON.parse(volumeMountsJson),
        volumes: JSON.parse(volumesJson),
        initCommands,
      };
      await saveProfile(name, updated);
      setSuccess(true);
      onSaved();
      setTimeout(() => setSuccess(false), 2000);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle className="text-lg">{name}</CardTitle>
            <CardDescription>{description || "No description"}</CardDescription>
          </div>
          <Badge variant="outline">{brain}</Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-1.5">
            <Label>Brain</Label>
            <Select
              value={brain}
              onValueChange={(v) => setBrain(v as ChimpProfile["brain"])}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="claude">claude</SelectItem>
                <SelectItem value="opencode">opencode</SelectItem>
                <SelectItem value="echo">echo</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label>Model</Label>
            <Input value={model} onChange={(e) => setModel(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Image</Label>
            <Input value={image} onChange={(e) => setImage(e.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label>Image Pull Policy</Label>
            <Input
              value={imagePullPolicy}
              onChange={(e) => setImagePullPolicy(e.target.value)}
              placeholder="Never"
            />
          </div>
        </div>
        <div className="space-y-1.5">
          <Label>Description</Label>
          <Input
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Environment Variables</Label>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() =>
                setExtraEnv([...extraEnv, { name: "", value: "" }])
              }
            >
              <Plus className="h-3 w-3" />
              Add
            </Button>
          </div>
          {extraEnv.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              No environment variables
            </p>
          ) : (
            <div className="space-y-2">
              {extraEnv.map((env, i) => (
                <EnvVarEditor
                  key={`env-${i}-${env.name}`}
                  env={env}
                  onChange={(updated) => {
                    const next = [...extraEnv];
                    next[i] = updated;
                    setExtraEnv(next);
                  }}
                  onRemove={() =>
                    setExtraEnv(extraEnv.filter((_, j) => j !== i))
                  }
                />
              ))}
            </div>
          )}
        </div>
        <div className="space-y-1.5">
          <Label>Volume Mounts (JSON)</Label>
          <Textarea
            value={volumeMountsJson}
            onChange={(e) => setVolumeMountsJson(e.target.value)}
            className="font-mono text-xs min-h-20"
          />
        </div>
        <div className="space-y-1.5">
          <Label>Volumes (JSON)</Label>
          <Textarea
            value={volumesJson}
            onChange={(e) => setVolumesJson(e.target.value)}
            className="font-mono text-xs min-h-20"
          />
        </div>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label>Init Commands</Label>
            <Button
              variant="outline"
              size="sm"
              className="gap-1"
              onClick={() =>
                setInitCommands([...initCommands, newCommand("clone-repo")])
              }
            >
              <Plus className="h-3 w-3" />
              Add
            </Button>
          </div>
          {initCommands.length === 0 ? (
            <p className="text-xs text-muted-foreground">No init commands</p>
          ) : (
            <div className="space-y-2">
              {initCommands.map((cmd, i) => (
                <CommandEditor
                  key={`${i}-${cmd.command}`}
                  command={cmd}
                  isFirst={i === 0}
                  isLast={i === initCommands.length - 1}
                  onChange={(updated) => {
                    const next = [...initCommands];
                    next[i] = updated;
                    setInitCommands(next);
                  }}
                  onRemove={() =>
                    setInitCommands(initCommands.filter((_, j) => j !== i))
                  }
                  onMoveUp={() => {
                    const next = [...initCommands];
                    const tmp = next[i]!;
                    next[i] = next[i - 1]!;
                    next[i - 1] = tmp;
                    setInitCommands(next);
                  }}
                  onMoveDown={() => {
                    const next = [...initCommands];
                    const tmp = next[i]!;
                    next[i] = next[i + 1]!;
                    next[i + 1] = tmp;
                    setInitCommands(next);
                  }}
                />
              ))}
            </div>
          )}
        </div>

        <div className="flex items-center gap-3">
          <Button
            onClick={handleSave}
            disabled={saving || deleting}
            className="gap-2"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            Save
          </Button>
          <Button
            variant="destructive"
            disabled={saving || deleting}
            className="gap-2"
            onClick={async () => {
              setDeleting(true);
              setError(null);
              try {
                await deleteProfile(name);
                onSaved();
              } catch (e) {
                setError(e instanceof Error ? e.message : "Delete failed");
              } finally {
                setDeleting(false);
              }
            }}
          >
            {deleting ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="h-4 w-4" />
            )}
            Delete
          </Button>
          {error && <span className="text-sm text-red-500">{error}</span>}
          {success && <span className="text-sm text-emerald-500">Saved</span>}
        </div>
      </CardContent>
    </Card>
  );
}
