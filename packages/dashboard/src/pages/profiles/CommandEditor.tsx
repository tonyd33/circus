import type { Protocol } from "@mnke/circus-shared";
import { ChevronDown, ChevronUp, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";

type ChimpCommand = Protocol.ChimpCommand;

const COMMAND_TYPES: ChimpCommand["command"][] = [
  "clone-repo",
  "set-working-dir",
  "set-system-prompt",
  "set-allowed-tools",
  "send-agent-message",
  "stop",
];

export function newCommand(type: string): ChimpCommand {
  switch (type) {
    case "clone-repo":
      return { command: "clone-repo", args: { url: "" } };
    case "set-working-dir":
      return { command: "set-working-dir", args: { path: "" } };
    case "set-system-prompt":
      return { command: "set-system-prompt", args: { prompt: "" } };
    case "set-allowed-tools":
      return { command: "set-allowed-tools", args: { tools: [] } };
    case "send-agent-message":
      return { command: "send-agent-message", args: { prompt: "" } };
    default:
      return { command: "stop" };
  }
}

export function CommandEditor({
  command,
  onChange,
  onRemove,
  onMoveUp,
  onMoveDown,
  isFirst,
  isLast,
}: {
  command: ChimpCommand;
  onChange: (cmd: ChimpCommand) => void;
  onRemove: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  isFirst: boolean;
  isLast: boolean;
}) {
  return (
    <div className="flex items-start gap-2 bg-muted/30 rounded-md p-2">
      <div className="flex flex-col shrink-0 mt-1">
        <button
          type="button"
          disabled={isFirst}
          onClick={onMoveUp}
          className="text-muted-foreground hover:text-foreground disabled:opacity-25"
        >
          <ChevronUp className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          disabled={isLast}
          onClick={onMoveDown}
          className="text-muted-foreground hover:text-foreground disabled:opacity-25"
        >
          <ChevronDown className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="flex-1 space-y-2">
        <Select
          value={command.command}
          onValueChange={(v) => onChange(newCommand(v))}
        >
          <SelectTrigger size="sm">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {COMMAND_TYPES.map((t) => (
              <SelectItem key={t} value={t}>
                {t}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        {command.command === "clone-repo" && (
          <div className="space-y-1.5">
            <Input
              placeholder="Repository URL"
              value={command.args.url}
              onChange={(e) =>
                onChange({
                  ...command,
                  args: { ...command.args, url: e.target.value },
                })
              }
            />
            <div className="grid grid-cols-2 gap-2">
              <Input
                placeholder="Branch (optional)"
                value={command.args.branch ?? ""}
                onChange={(e) =>
                  onChange({
                    ...command,
                    args: {
                      ...command.args,
                      branch: e.target.value || undefined,
                    },
                  })
                }
              />
              <Input
                placeholder="Path (optional)"
                value={command.args.path ?? ""}
                onChange={(e) =>
                  onChange({
                    ...command,
                    args: {
                      ...command.args,
                      path: e.target.value || undefined,
                    },
                  })
                }
              />
            </div>
          </div>
        )}

        {command.command === "set-working-dir" && (
          <Input
            placeholder="Working directory path"
            value={command.args.path}
            onChange={(e) =>
              onChange({ ...command, args: { path: e.target.value } })
            }
          />
        )}

        {command.command === "set-system-prompt" && (
          <Textarea
            placeholder="System prompt"
            value={command.args.prompt}
            onChange={(e) =>
              onChange({ ...command, args: { prompt: e.target.value } })
            }
            className="min-h-24"
          />
        )}

        {command.command === "set-allowed-tools" && (
          <Textarea
            placeholder="One tool per line, e.g. mcp__circus__chimp_request"
            value={command.args.tools.join("\n")}
            onChange={(e) =>
              onChange({
                ...command,
                args: {
                  tools: e.target.value.split("\n"),
                },
              })
            }
            onBlur={(e) =>
              onChange({
                ...command,
                args: {
                  tools: e.target.value
                    .split("\n")
                    .map((t) => t.trim())
                    .filter(Boolean),
                },
              })
            }
            className="font-mono text-xs min-h-20"
          />
        )}

        {command.command === "send-agent-message" && (
          <Textarea
            placeholder="Prompt"
            value={command.args.prompt}
            onChange={(e) =>
              onChange({ ...command, args: { prompt: e.target.value } })
            }
            className="min-h-16"
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
