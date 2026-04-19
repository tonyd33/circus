import { Key, Type, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export interface EnvVar {
  name: string;
  value?: string;
  valueFrom?: {
    secretKeyRef?: { name: string; key: string };
  };
}

function isSecretRef(env: EnvVar): boolean {
  return env.valueFrom?.secretKeyRef != null;
}

export function EnvVarEditor({
  env,
  onChange,
  onRemove,
}: {
  env: EnvVar;
  onChange: (e: EnvVar) => void;
  onRemove: () => void;
}) {
  const isSecret = isSecretRef(env);

  return (
    <div className="flex items-start gap-2 bg-muted/30 rounded-md p-2">
      <div className="flex-1 space-y-2">
        <div className="flex items-center gap-2">
          <Input
            placeholder="ENV_VAR_NAME"
            value={env.name}
            onChange={(e) => onChange({ ...env, name: e.target.value })}
            className="font-mono text-xs"
          />
          <Button
            variant="ghost"
            size="sm"
            className="shrink-0 gap-1 text-xs"
            onClick={() => {
              if (isSecret) {
                onChange({ name: env.name, value: "" });
              } else {
                onChange({
                  name: env.name,
                  valueFrom: { secretKeyRef: { name: "", key: "" } },
                });
              }
            }}
          >
            {isSecret ? (
              <>
                <Key className="h-3 w-3" /> Secret
              </>
            ) : (
              <>
                <Type className="h-3 w-3" /> Value
              </>
            )}
          </Button>
        </div>
        {isSecret ? (
          <div className="grid grid-cols-2 gap-2">
            <Input
              placeholder="Secret name"
              value={env.valueFrom?.secretKeyRef?.name ?? ""}
              onChange={(e) =>
                onChange({
                  name: env.name,
                  valueFrom: {
                    secretKeyRef: {
                      name: e.target.value,
                      key: env.valueFrom?.secretKeyRef?.key ?? "",
                    },
                  },
                })
              }
              className="text-xs"
            />
            <Input
              placeholder="Secret key"
              value={env.valueFrom?.secretKeyRef?.key ?? ""}
              onChange={(e) =>
                onChange({
                  name: env.name,
                  valueFrom: {
                    secretKeyRef: {
                      name: env.valueFrom?.secretKeyRef?.name ?? "",
                      key: e.target.value,
                    },
                  },
                })
              }
              className="text-xs"
            />
          </div>
        ) : (
          <Input
            placeholder="Value"
            value={env.value ?? ""}
            onChange={(e) =>
              onChange({ name: env.name, value: e.target.value })
            }
            className="text-xs"
          />
        )}
      </div>
      <button
        type="button"
        onClick={onRemove}
        className="mt-2 text-muted-foreground hover:text-red-500"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
