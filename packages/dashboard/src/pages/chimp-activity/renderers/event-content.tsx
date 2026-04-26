import type { Protocol } from "@mnke/circus-shared";
import {
  BookOpen,
  Cog,
  FolderSync,
  GitBranch,
  MessageSquare,
  OctagonX,
  Terminal,
} from "lucide-react";
import { memo } from "react";
import { ExpandableJSON } from "@/components/ExpandableJSON";

export const EventContent = memo(function EventContent({
  data,
}: {
  data: Protocol.ChimpCommand;
}) {
  switch (data.command) {
    case "send-agent-message":
      return (
        <div className="flex items-start gap-2.5">
          <MessageSquare className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm whitespace-pre-wrap leading-relaxed">
            {data.args.prompt || "(empty prompt)"}
          </p>
        </div>
      );
    case "stop":
      return (
        <div className="flex items-center gap-2.5">
          <OctagonX className="h-4 w-4 text-red-400 shrink-0" />
          <span className="text-sm text-muted-foreground">Stop requested</span>
        </div>
      );
    case "clone-repo":
      return (
        <div className="flex items-center gap-2.5">
          <GitBranch className="h-4 w-4 text-emerald-400 shrink-0" />
          <code className="text-sm font-mono bg-muted/30 rounded px-2 py-1">
            {data.args.url}
            {data.args.branch ? ` @ ${data.args.branch}` : ""}
          </code>
        </div>
      );
    case "gh-clone-repo":
      return (
        <div className="flex items-center gap-2.5">
          <GitBranch className="h-4 w-4 text-emerald-400 shrink-0" />
          <code className="text-sm font-mono bg-muted/30 rounded px-2 py-1">
            {data.args.repo}
            {data.args.branch ? ` @ ${data.args.branch}` : ""}
          </code>
        </div>
      );
    case "set-working-dir":
      return (
        <div className="flex items-center gap-2.5">
          <FolderSync className="h-4 w-4 text-blue-400 shrink-0" />
          <code className="text-sm font-mono bg-muted/30 rounded px-2 py-1">
            {data.args.path}
          </code>
        </div>
      );
    case "set-system-prompt":
      return (
        <div className="flex items-center gap-2.5">
          <BookOpen className="h-4 w-4 text-blue-400 shrink-0" />
          <span className="text-sm text-muted-foreground">
            System prompt set
          </span>
        </div>
      );
    case "append-system-prompt":
      return (
        <div className="flex items-center gap-2.5">
          <BookOpen className="h-4 w-4 text-blue-400 shrink-0" />
          <span className="text-sm text-muted-foreground">
            System prompt appended
          </span>
        </div>
      );
    case "set-allowed-tools":
      return (
        <div className="flex items-center gap-2.5">
          <Cog className="h-4 w-4 text-blue-400 shrink-0" />
          <span className="text-sm text-muted-foreground">
            Allowed tools: {data.args.tools.length}
          </span>
        </div>
      );
    case "setup-github-auth":
      return (
        <div className="flex items-center gap-2.5">
          <Terminal className="h-4 w-4 text-emerald-400 shrink-0" />
          <span className="text-sm text-muted-foreground">
            GitHub auth configured
          </span>
        </div>
      );
    default:
      return <ExpandableJSON data={data} label="Payload" />;
  }
});
