import type { SDKMessage } from "@anthropic-ai/claude-agent-sdk";
import type { Protocol } from "@mnke/circus-shared";
import type * as Opencode from "@opencode-ai/sdk";
import {
  AlertTriangle,
  FileBox,
  GitPullRequestArrow,
  Hash,
  MessageCircle,
} from "lucide-react";
import { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExpandableJSON } from "@/components/ExpandableJSON";
import { Badge } from "@/components/ui/badge";
import { ClaudeThought } from "./claude-thought";
import { EventContent } from "./event-content";
import { OpencodeThought } from "./opencode-thought";

export const OutputContent = memo(function OutputContent({
  data,
}: {
  data: Protocol.ChimpOutputMessage;
}) {
  switch (data.type) {
    case "agent-message-response":
      return (
        <div className="bg-muted/50 rounded-lg p-3 prose prose-sm dark:prose-invert max-w-none">
          <Markdown remarkPlugins={[remarkGfm]}>
            {data.content || "(empty response)"}
          </Markdown>
        </div>
      );
    case "progress":
      return (
        <div className="space-y-1.5">
          <span className="text-sm">{data.message}</span>
          {data.percentage !== undefined && (
            <div className="flex items-center gap-2">
              <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full rounded-full bg-amber-500 transition-all duration-300"
                  style={{
                    width: `${Math.min(Math.max(data.percentage, 0), 100)}%`,
                  }}
                />
              </div>
              <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
                {data.percentage}%
              </span>
            </div>
          )}
        </div>
      );
    case "command-received":
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-xs shrink-0 border-blue-500 text-blue-500"
            >
              received
            </Badge>
            <code className="text-xs font-mono">{data.command}</code>
          </div>
          {data.payload && (
            <div className="ml-4 border-l-2 border-blue-500/30 pl-3">
              <EventContent data={data.payload} />
            </div>
          )}
        </div>
      );
    case "artifact":
      return (
        <div className="flex items-center gap-3 bg-muted/30 rounded-lg p-2.5">
          <FileBox className="h-5 w-5 text-ring shrink-0" />
          <div>
            <span className="text-sm font-medium">
              {data.name || "Untitled"}
            </span>
            <span className="text-xs text-muted-foreground ml-2">
              {data.artifactType}
            </span>
          </div>
        </div>
      );
    case "error":
      return (
        <div className="flex items-start gap-2 bg-red-500/10 rounded-lg p-2.5">
          <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <div className="text-sm">
            <span className="font-medium text-red-500">{data.error}</span>
            {data.command && (
              <span className="text-muted-foreground ml-1">
                in <code className="font-mono text-xs">{data.command}</code>
              </span>
            )}
          </div>
        </div>
      );
    case "thought": {
      if (data.brain === "claude") {
        return <ClaudeThought event={data.event as SDKMessage} />;
      }
      if (data.brain === "opencode") {
        return <OpencodeThought event={data.event as Opencode.Event} />;
      }
      return <ExpandableJSON data={data.event} label="Event" />;
    }
    case "chimp-request":
      return (
        <div className="flex items-start gap-2.5 bg-blue-500/10 rounded-lg p-3">
          <MessageCircle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">&rarr;</span>
              <Badge variant="outline" className="text-xs font-mono">
                {data.chimpId}
              </Badge>
              <Badge variant="secondary" className="text-xs">
                {data.profile}
              </Badge>
            </div>
          </div>
        </div>
      );
    case "discord-response":
      return (
        <div className="flex items-start gap-2.5 bg-indigo-500/10 rounded-lg p-3">
          <Hash className="h-4 w-4 text-indigo-500 shrink-0 mt-0.5" />
          <div className="space-y-1 flex-1">
            <span className="text-xs text-muted-foreground">Discord reply</span>
            <p className="text-sm whitespace-pre-wrap">{data.content}</p>
          </div>
        </div>
      );
    case "github-comment":
      return (
        <div className="flex items-start gap-2.5 bg-emerald-500/10 rounded-lg p-3">
          <GitPullRequestArrow className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
          <div className="space-y-1 flex-1">
            <Badge
              variant="outline"
              className="text-xs font-mono text-emerald-500 border-emerald-500/30"
            >
              {data.repo}#{data.issueNumber}
            </Badge>
            <div className="prose prose-sm dark:prose-invert max-w-none">
              <Markdown remarkPlugins={[remarkGfm]}>{data.content}</Markdown>
            </div>
          </div>
        </div>
      );
    default:
      return <ExpandableJSON data={data} label="Payload" />;
  }
});
