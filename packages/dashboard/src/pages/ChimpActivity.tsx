/**
 * Real-time activity feed for a chimp agent.
 * Streams events and outputs via SSE, with filtering and auto-scroll.
 */

import type {
  SDKAssistantMessage,
  SDKMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import { type Protocol, Standards } from "@mnke/circus-shared";
import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  BookOpen,
  Bot,
  Brain,
  CheckCircle,
  Circle,
  CircleDot,
  Clock,
  Code,
  Cog,
  Eye,
  FileBox,
  FileText,
  Filter,
  FolderSync,
  GitBranch,
  GitPullRequestArrow,
  Globe,
  Hash,
  Image,
  ListChecks,
  Loader2,
  Megaphone,
  MessageCircle,
  MessageSquare,
  OctagonX,
  Play,
  Radio,
  RefreshCw,
  ScrollText,
  Search,
  Send,
  Server,
  Sparkles,
  Terminal,
  User,
  Webhook,
  XCircle,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Link, useParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
import { ExpandableJSON } from "@/components/ExpandableJSON";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { useSSE } from "@/hooks/useSSE";
import type { ActivityEvent } from "@/lib/chimp";

type ActivityMessage = ActivityEvent;

function getMessageType(msg: ActivityMessage): string {
  switch (msg.type) {
    case "event":
      return msg.data.command;
    case "output":
      return msg.data.type;
    case "meta":
      return msg.data.type;
    case "unknown":
      return "unknown";
  }
}

const messageTypeIcons: Record<string, React.ReactNode> = {
  "agent-message-response": <Brain className="h-3.5 w-3.5" />,
  "send-agent-message": <MessageSquare className="h-3.5 w-3.5" />,
  "command-received": <ScrollText className="h-3.5 w-3.5" />,
  error: <AlertTriangle className="h-3.5 w-3.5" />,
  progress: <Loader2 className="h-3.5 w-3.5" />,
  artifact: <FileBox className="h-3.5 w-3.5" />,
  stop: <OctagonX className="h-3.5 w-3.5" />,
  "new-session": <RefreshCw className="h-3.5 w-3.5" />,
  "clone-repo": <GitBranch className="h-3.5 w-3.5" />,
  "gh-clone-repo": <GitBranch className="h-3.5 w-3.5" />,
  "set-working-dir": <FolderSync className="h-3.5 w-3.5" />,
  "set-system-prompt": <BookOpen className="h-3.5 w-3.5" />,
  "append-system-prompt": <BookOpen className="h-3.5 w-3.5" />,
  "set-allowed-tools": <Cog className="h-3.5 w-3.5" />,
  "setup-github-auth": <Terminal className="h-3.5 w-3.5" />,
  "subscribe-topic": <Sparkles className="h-3.5 w-3.5" />,
  "add-event-context": <Sparkles className="h-3.5 w-3.5" />,
  "chimp-request": <MessageCircle className="h-3.5 w-3.5" />,
  "discord-response": <Hash className="h-3.5 w-3.5" />,
  "github-comment": <GitPullRequestArrow className="h-3.5 w-3.5" />,
  thought: <Brain className="h-3.5 w-3.5" />,
};

const typeIcons: Record<string, React.ReactNode> = {
  event: <Radio className="h-3 w-3" />,
  output: <Sparkles className="h-3 w-3" />,
};

const sortByTimestamp = (a: ActivityMessage, b: ActivityMessage) =>
  new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();

// ─── Claude thought rendering ─────────────────────────────────────────

type ContentBlock = SDKAssistantMessage["message"]["content"][number];
type ContentBlockParam = Extract<
  SDKUserMessage["message"]["content"],
  unknown[]
>[number];

function renderContentBlock(block: ContentBlock, i: number) {
  switch (block.type) {
    case "text":
      return block.text ? (
        <div
          key={i}
          className="bg-muted/50 rounded-lg p-3 prose prose-sm dark:prose-invert max-w-none"
        >
          <Markdown remarkPlugins={[remarkGfm]}>{block.text}</Markdown>
        </div>
      ) : null;

    case "tool_use": {
      // Bash gets a special renderer
      if (
        block.name === "Bash" &&
        block.input &&
        typeof block.input === "object"
      ) {
        const input = block.input as Record<string, unknown>;
        const command =
          typeof input.command === "string" ? input.command : undefined;
        const description =
          typeof input.description === "string" ? input.description : undefined;
        return (
          <div key={i} className="bg-muted/30 rounded-lg p-2.5 space-y-1.5">
            <div className="flex items-center gap-2">
              <Terminal className="h-3.5 w-3.5 text-circus-gold shrink-0" />
              <code className="text-xs font-mono font-medium text-circus-gold">
                Bash
              </code>
              <code className="text-xs font-mono text-muted-foreground/40 ml-auto">
                {block.id.slice(-8)}
              </code>
            </div>
            {description && (
              <p className="text-xs text-muted-foreground pl-5">
                {description}
              </p>
            )}
            {command && (
              <pre className="text-xs font-mono bg-black/30 rounded p-2 whitespace-pre-wrap break-all overflow-x-auto">
                {command}
              </pre>
            )}
          </div>
        );
      }
      return (
        <div key={i} className="bg-muted/30 rounded-lg p-2.5 space-y-1.5">
          <div className="flex items-center gap-2">
            <Terminal className="h-3.5 w-3.5 text-circus-gold shrink-0" />
            <code className="text-xs font-mono font-medium text-circus-gold">
              {block.name}
            </code>
            <code className="text-xs font-mono text-muted-foreground/40 ml-auto">
              {block.id.slice(-8)}
            </code>
          </div>
          {block.input != null && (
            <ExpandableJSON data={block.input} label="Input" />
          )}
        </div>
      );
    }

    case "thinking":
      return (
        <div
          key={i}
          className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 space-y-1.5"
        >
          <div className="flex items-center gap-2">
            <Brain className="h-3.5 w-3.5 text-purple-400 shrink-0" />
            <span className="text-xs font-medium text-purple-400">
              Thinking
            </span>
          </div>
          {block.thinking ? (
            <p className="text-sm whitespace-pre-wrap text-muted-foreground leading-relaxed">
              {block.thinking}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground/60 italic">(empty)</p>
          )}
        </div>
      );

    case "redacted_thinking":
      return (
        <div
          key={i}
          className="bg-slate-500/5 border border-slate-500/20 rounded-lg p-2.5"
        >
          <div className="flex items-center gap-2">
            <Eye className="h-3.5 w-3.5 text-slate-500 shrink-0" />
            <code className="text-xs font-mono font-medium text-slate-500">
              redacted_thinking
            </code>
          </div>
        </div>
      );

    case "server_tool_use":
      return (
        <div key={i} className="bg-muted/30 rounded-lg p-2.5 space-y-1.5">
          <div className="flex items-center gap-2">
            <Server className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            <code className="text-xs font-mono font-medium text-blue-400">
              {block.name}
            </code>
            <code className="text-xs font-mono text-muted-foreground/40 ml-auto">
              {block.id.slice(-8)}
            </code>
          </div>
          {block.input != null && (
            <ExpandableJSON data={block.input} label="Input" />
          )}
        </div>
      );

    case "web_search_tool_result": {
      const isError = "error_code" in block.content;
      return (
        <div
          key={i}
          className={`rounded-lg p-2.5 space-y-1.5 ${isError ? "bg-red-500/10 border border-red-500/20" : "bg-blue-500/10 border border-blue-500/20"}`}
        >
          <div className="flex items-center gap-2">
            <Globe
              className={`h-3.5 w-3.5 shrink-0 ${isError ? "text-red-400" : "text-blue-400"}`}
            />
            <code
              className={`text-xs font-mono font-medium ${isError ? "text-red-400" : "text-blue-400"}`}
            >
              web_search
            </code>
            {!isError && Array.isArray(block.content) && (
              <span className="text-xs text-muted-foreground/60 ml-auto">
                {block.content.length} result
                {block.content.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          <ExpandableJSON
            data={block.content}
            label={isError ? "Error" : "Results"}
          />
        </div>
      );
    }

    case "web_fetch_tool_result": {
      const isError = "error_code" in block.content;
      return (
        <div
          key={i}
          className={`rounded-lg p-2.5 space-y-1.5 ${isError ? "bg-red-500/10 border border-red-500/20" : "bg-cyan-500/10 border border-cyan-500/20"}`}
        >
          <div className="flex items-center gap-2">
            <Globe
              className={`h-3.5 w-3.5 shrink-0 ${isError ? "text-red-400" : "text-cyan-400"}`}
            />
            <code
              className={`text-xs font-mono font-medium ${isError ? "text-red-400" : "text-cyan-400"}`}
            >
              web_fetch
            </code>
          </div>
          <ExpandableJSON
            data={block.content}
            label={isError ? "Error" : "Content"}
          />
        </div>
      );
    }

    case "code_execution_tool_result":
    case "bash_code_execution_tool_result": {
      const displayName =
        block.type === "bash_code_execution_tool_result" ? "bash" : "code";
      const content = block.content;
      if ("error_code" in content) {
        return (
          <div
            key={i}
            className="rounded-lg p-2.5 space-y-1.5 bg-red-500/10 border border-red-500/20"
          >
            <div className="flex items-center gap-2">
              <Code className="h-3.5 w-3.5 shrink-0 text-red-400" />
              <code className="text-xs font-mono font-medium text-red-400">
                {displayName}
              </code>
            </div>
            <ExpandableJSON data={content} label="Error" />
          </div>
        );
      }
      if ("stdout" in content) {
        return (
          <div
            key={i}
            className="rounded-lg p-2.5 space-y-1.5 bg-emerald-500/10 border border-emerald-500/20"
          >
            <div className="flex items-center gap-2 flex-wrap">
              <Code className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
              <code className="text-xs font-mono font-medium text-emerald-400">
                {displayName}
              </code>
              <Badge
                variant="secondary"
                className="text-xs border-emerald-500/40 text-emerald-400"
              >
                exit {content.return_code}
              </Badge>
            </div>
            <div className="space-y-1">
              {content.stdout && (
                <pre className="text-xs font-mono bg-black/20 rounded p-2 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                  {content.stdout}
                </pre>
              )}
              {content.stderr && (
                <pre className="text-xs font-mono bg-red-500/10 text-red-300 rounded p-2 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                  {content.stderr}
                </pre>
              )}
            </div>
          </div>
        );
      }
      // Encrypted or unknown content variant
      return (
        <div key={i} className="rounded-lg p-2.5 space-y-1.5 bg-muted/30">
          <div className="flex items-center gap-2">
            <Code className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <code className="text-xs font-mono font-medium text-emerald-400">
              {displayName}
            </code>
          </div>
          <ExpandableJSON data={content} label="Result" />
        </div>
      );
    }

    case "text_editor_code_execution_tool_result":
      return (
        <div
          key={i}
          className="rounded-lg p-2.5 space-y-1.5 bg-emerald-500/10 border border-emerald-500/20"
        >
          <div className="flex items-center gap-2">
            <Code className="h-3.5 w-3.5 shrink-0 text-emerald-400" />
            <code className="text-xs font-mono font-medium text-emerald-400">
              editor
            </code>
          </div>
          <ExpandableJSON data={block.content} label="Result" />
        </div>
      );

    case "tool_search_tool_result": {
      const isError = "error_code" in block.content;
      return (
        <div
          key={i}
          className={`rounded-lg p-2.5 space-y-1.5 ${isError ? "bg-red-500/10 border border-red-500/20" : "bg-purple-500/10 border border-purple-500/20"}`}
        >
          <div className="flex items-center gap-2">
            <Search
              className={`h-3.5 w-3.5 shrink-0 ${isError ? "text-red-400" : "text-purple-400"}`}
            />
            <code
              className={`text-xs font-mono font-medium ${isError ? "text-red-400" : "text-purple-400"}`}
            >
              tool_search
            </code>
          </div>
          <ExpandableJSON
            data={block.content}
            label={isError ? "Error" : "Results"}
          />
        </div>
      );
    }

    case "mcp_tool_use":
      return (
        <div key={i} className="bg-muted/30 rounded-lg p-2.5 space-y-1.5">
          <div className="flex items-center gap-2 flex-wrap">
            <Webhook className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
            <code className="text-xs font-mono font-medium text-indigo-400">
              {block.server_name}
            </code>
            <span className="text-xs text-muted-foreground">/</span>
            <code className="text-xs font-mono font-medium">{block.name}</code>
            <code className="text-xs font-mono text-muted-foreground/40 ml-auto">
              {block.id.slice(-8)}
            </code>
          </div>
          {block.input != null && (
            <ExpandableJSON data={block.input} label="Input" />
          )}
        </div>
      );

    case "mcp_tool_result": {
      const content = block.content;
      return (
        <div
          key={i}
          className={`rounded-lg p-2.5 space-y-1.5 ${block.is_error ? "bg-red-500/10 border border-red-500/20" : "bg-indigo-500/10 border border-indigo-500/20"}`}
        >
          <div className="flex items-center gap-2">
            <Webhook
              className={`h-3.5 w-3.5 shrink-0 ${block.is_error ? "text-red-400" : "text-indigo-400"}`}
            />
            <code
              className={`text-xs font-mono font-medium ${block.is_error ? "text-red-400" : "text-indigo-400"}`}
            >
              mcp result
            </code>
            {block.is_error && (
              <Badge
                variant="outline"
                className="text-xs border-red-500/40 text-red-400"
              >
                error
              </Badge>
            )}
          </div>
          {typeof content === "string" ? (
            <p className="text-xs text-muted-foreground whitespace-pre-wrap">
              {content}
            </p>
          ) : Array.isArray(content) ? (
            <div className="space-y-1">
              {content.map((b, j) => (
                <p
                  key={j}
                  className="text-xs text-muted-foreground whitespace-pre-wrap"
                >
                  {b.text}
                </p>
              ))}
            </div>
          ) : null}
        </div>
      );
    }

    default:
      return (
        <div key={i} className="bg-muted/30 rounded-lg p-2.5 space-y-1">
          <Badge variant="outline" className="text-xs font-mono">
            {(block as { type: string }).type}
          </Badge>
          <ExpandableJSON data={block} label="Block details" />
        </div>
      );
  }
}

function renderClaudeThought(event: SDKMessage) {
  switch (event.type) {
    case "assistant": {
      const { message } = event;
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2.5">
            <Bot className="h-4 w-4 text-circus-purple shrink-0" />
            <span className="text-sm font-medium">Assistant response</span>
            <span className="font-mono text-xs bg-muted/50 px-2 py-1 rounded">
              {message.model}
            </span>
            {message.stop_reason && (
              <Badge variant="outline" className="text-xs font-mono">
                {message.stop_reason}
              </Badge>
            )}
          </div>
          {message.usage && (
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground/70">Input:</span>
                <span className="font-mono font-medium">
                  {message.usage.input_tokens}
                </span>
                {message.usage.cache_read_input_tokens != null &&
                  message.usage.cache_read_input_tokens > 0 && (
                    <span className="text-blue-500/70">
                      (+{message.usage.cache_read_input_tokens} cached)
                    </span>
                  )}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground/70">Output:</span>
                <span className="font-mono font-medium">
                  {message.usage.output_tokens}
                </span>
                {message.usage.cache_creation_input_tokens != null &&
                  message.usage.cache_creation_input_tokens > 0 && (
                    <span className="text-amber-500/70">
                      (+{message.usage.cache_creation_input_tokens} created)
                    </span>
                  )}
              </div>
            </div>
          )}
          {message.content.length > 0 && (
            <div className="space-y-2">
              {message.content.map((block, i) => renderContentBlock(block, i))}
            </div>
          )}
        </div>
      );
    }

    case "result": {
      const isError = event.subtype !== "success";
      return (
        <div
          className={`rounded-lg p-2.5 space-y-2 ${isError ? "bg-red-500/10" : "bg-emerald-500/10"}`}
        >
          <div className="flex items-center gap-2.5">
            {isError ? (
              <XCircle className="h-4 w-4 text-red-500 shrink-0" />
            ) : (
              <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
            )}
            <span
              className={`text-sm font-medium ${isError ? "text-red-500" : "text-emerald-500"}`}
            >
              {isError ? `Error: ${event.subtype}` : "Completed"}
            </span>
            <div className="flex items-center gap-3 ml-auto text-xs text-muted-foreground tabular-nums">
              {event.num_turns !== undefined && (
                <span>{event.num_turns} turns</span>
              )}
              {event.duration_ms !== undefined && (
                <span>{(event.duration_ms / 1000).toFixed(1)}s</span>
              )}
              {"total_cost_usd" in event && (
                <span>${event.total_cost_usd.toFixed(4)}</span>
              )}
            </div>
          </div>
          {"result" in event && event.result && (
            <div className="bg-muted/50 rounded-lg p-3 prose prose-sm dark:prose-invert max-w-none">
              <Markdown remarkPlugins={[remarkGfm]}>{event.result}</Markdown>
            </div>
          )}
          {"errors" in event && event.errors.length > 0 && (
            <div className="space-y-1">
              {event.errors.map((err, i) => (
                <p
                  key={i}
                  className="text-xs text-red-400 font-mono bg-red-500/10 rounded px-2 py-1"
                >
                  {err}
                </p>
              ))}
            </div>
          )}
        </div>
      );
    }

    case "user": {
      const rawContent = event.message.content;
      if (typeof rawContent === "string") {
        return (
          <div className="flex items-start gap-2.5">
            <User className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm whitespace-pre-wrap">
              {rawContent || "(empty)"}
            </p>
          </div>
        );
      }
      if (Array.isArray(rawContent)) {
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <User className="h-4 w-4 text-amber-500 shrink-0" />
              <span className="text-xs text-muted-foreground font-medium">
                User message
              </span>
            </div>
            <div className="space-y-1.5 pl-6">
              {(rawContent as ContentBlockParam[]).map((block, i) =>
                renderUserBlock(block, i, event.tool_use_result),
              )}
            </div>
          </div>
        );
      }
      return (
        <div className="flex items-start gap-2.5">
          <User className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
          <p className="text-sm text-muted-foreground italic">(user message)</p>
        </div>
      );
    }

    case "tool_use_summary":
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Terminal className="h-4 w-4 text-circus-gold shrink-0" />
            <span className="text-xs text-muted-foreground font-medium">
              Tool use summary
            </span>
            {event.preceding_tool_use_ids.length > 0 && (
              <span className="text-xs text-muted-foreground/60">
                ({event.preceding_tool_use_ids.length} tool
                {event.preceding_tool_use_ids.length !== 1 ? "s" : ""})
              </span>
            )}
          </div>
          <p className="text-sm text-muted-foreground pl-6">{event.summary}</p>
        </div>
      );

    default:
      // All system subtypes + anything else
      return renderSystemOrFallback(event);
  }
}

function renderUserBlock(
  block: ContentBlockParam,
  i: number,
  toolUseResult: unknown,
) {
  switch (block.type) {
    case "text":
      return block.text ? (
        <p key={i} className="text-sm whitespace-pre-wrap">
          {block.text}
        </p>
      ) : null;

    case "tool_result": {
      // Prefer structured tool_use_result from SDK (has stdout/stderr)
      const tur = toolUseResult as Record<string, unknown> | undefined;
      const stdout = typeof tur?.stdout === "string" ? tur.stdout : undefined;
      const stderr = typeof tur?.stderr === "string" ? tur.stderr : undefined;
      const isImage = tur?.isImage === true;
      const interrupted = tur?.interrupted === true;

      // Fall back to block content
      const contentText =
        !stdout && typeof block.content === "string"
          ? block.content
          : !stdout && Array.isArray(block.content)
            ? block.content
                .filter(
                  (
                    b,
                  ): b is ContentBlockParam & { type: "text"; text: string } =>
                    b.type === "text" && "text" in b,
                )
                .map((b) => b.text)
                .join("\n")
            : undefined;

      const displayStdout = stdout ?? contentText;
      const hasOutput = displayStdout || stderr;

      return (
        <div
          key={i}
          className={`rounded-lg p-2.5 space-y-1.5 ${block.is_error ? "bg-red-500/10 border border-red-500/20" : "bg-emerald-500/10 border border-emerald-500/20"}`}
        >
          <div className="flex items-center gap-2 flex-wrap">
            <Terminal
              className={`h-3.5 w-3.5 shrink-0 ${block.is_error ? "text-red-400" : "text-emerald-400"}`}
            />
            <span className="text-xs font-medium text-muted-foreground">
              tool result
            </span>
            {block.tool_use_id && (
              <code className="text-xs font-mono text-muted-foreground/50">
                {block.tool_use_id.slice(-8)}
              </code>
            )}
            {block.is_error && (
              <Badge
                variant="outline"
                className="text-xs border-red-500/40 text-red-400"
              >
                error
              </Badge>
            )}
            {interrupted && (
              <Badge
                variant="outline"
                className="text-xs border-amber-500/40 text-amber-400"
              >
                interrupted
              </Badge>
            )}
          </div>
          {isImage ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground pl-5">
              <Image className="h-3.5 w-3.5 shrink-0" />
              <span>[Image output]</span>
            </div>
          ) : (
            hasOutput && (
              <div className="space-y-1">
                {displayStdout && (
                  <pre className="text-xs font-mono bg-black/20 rounded p-2 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                    {displayStdout}
                  </pre>
                )}
                {stderr && (
                  <pre className="text-xs font-mono bg-red-500/10 text-red-300 rounded p-2 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                    {stderr}
                  </pre>
                )}
              </div>
            )
          )}
        </div>
      );
    }

    case "image":
      return (
        <div
          key={i}
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <Image className="h-3.5 w-3.5 shrink-0" />
          <span>[Image attachment]</span>
        </div>
      );

    case "document": {
      const title = "title" in block ? block.title : undefined;
      return (
        <div
          key={i}
          className="flex items-center gap-2 text-xs text-muted-foreground"
        >
          <FileText className="h-3.5 w-3.5 shrink-0" />
          <span>{title ? `Document: ${title}` : "[Document]"}</span>
        </div>
      );
    }

    default:
      return (
        <ExpandableJSON
          key={i}
          data={block}
          label={(block as { type: string }).type}
        />
      );
  }
}

/**
 * Handles system-subtype messages and unknown event types.
 * System messages use `subtype` for further discrimination.
 */
function renderSystemOrFallback(event: SDKMessage) {
  if (event.type !== "system") {
    return (
      <div className="space-y-1">
        <Badge variant="outline" className="text-xs font-mono">
          {event.type}
        </Badge>
        <ExpandableJSON data={event} label="Event details" />
      </div>
    );
  }

  switch (event.subtype) {
    case "api_retry":
      return (
        <div className="flex items-center gap-2.5 bg-amber-500/10 rounded-lg p-2.5">
          <Clock className="h-4 w-4 text-amber-500 shrink-0" />
          <span className="text-sm text-amber-500">
            API retry {event.attempt}/{event.max_retries}
          </span>
        </div>
      );

    case "compact_boundary":
      return (
        <div className="flex items-center gap-2.5">
          <RefreshCw className="h-4 w-4 text-blue-400 shrink-0" />
          <span className="text-sm text-muted-foreground">
            Context compacted
          </span>
        </div>
      );

    case "notification":
      return (
        <div className="flex items-center gap-2.5">
          <Radio className="h-4 w-4 text-blue-400 shrink-0" />
          <span className="text-sm text-muted-foreground">
            {event.text || "Notification"}
          </span>
        </div>
      );

    case "memory_recall":
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-purple-400 shrink-0" />
            <span className="text-sm text-muted-foreground">
              Memory recalled
            </span>
            <Badge variant="outline" className="text-xs font-mono">
              {event.mode}
            </Badge>
            {event.memories.length > 0 && (
              <span className="text-xs text-muted-foreground/70">
                {event.memories.length} file
                {event.memories.length !== 1 ? "s" : ""}
              </span>
            )}
          </div>
          {event.memories.length > 0 && (
            <div className="pl-6 space-y-0.5">
              {event.memories.map((m, i) => (
                <p
                  key={i}
                  className="text-xs font-mono text-muted-foreground/70 truncate"
                >
                  {m.path}
                </p>
              ))}
            </div>
          )}
        </div>
      );

    case "init":
      return (
        <div className="space-y-2">
          <div className="flex items-center gap-2">
            <Server className="h-4 w-4 text-blue-400 shrink-0" />
            <span className="text-sm font-medium">Claude initialized</span>
            <span className="font-mono text-xs bg-muted/50 px-2 py-1 rounded">
              {event.model}
            </span>
          </div>
          <div className="pl-6 space-y-1 text-xs text-muted-foreground">
            {event.cwd && (
              <div className="flex items-center gap-1.5">
                <FolderSync className="h-3 w-3 shrink-0" />
                <code className="font-mono">{event.cwd}</code>
              </div>
            )}
            {event.tools.length > 0 && (
              <div className="flex items-center gap-1.5">
                <Cog className="h-3 w-3 shrink-0" />
                <span>{event.tools.length} tools</span>
              </div>
            )}
            {event.mcp_servers.length > 0 && (
              <div className="space-y-0.5">
                {event.mcp_servers.map((srv, i) => (
                  <div key={i} className="flex items-center gap-1.5">
                    <Webhook className="h-3 w-3 shrink-0" />
                    <span className="font-mono">{srv.name}</span>
                    <Badge variant="outline" className="text-xs py-0">
                      {srv.status}
                    </Badge>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      );

    case "local_command_output":
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Terminal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground font-medium">
              Command output
            </span>
          </div>
          {event.content && (
            <pre className="text-xs font-mono bg-muted/30 rounded p-2 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
              {event.content}
            </pre>
          )}
        </div>
      );

    case "task_started":
      return (
        <div className="flex items-center gap-2.5">
          <Play className="h-3.5 w-3.5 text-blue-400 shrink-0" />
          <span className="text-sm text-muted-foreground">
            {event.description || "Task started"}
          </span>
          {event.task_type && (
            <Badge variant="outline" className="text-xs font-mono">
              {event.task_type}
            </Badge>
          )}
        </div>
      );

    case "task_progress":
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <ListChecks className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            <span className="text-sm text-muted-foreground">
              {event.description || "Task in progress"}
            </span>
          </div>
          <div className="flex flex-wrap gap-3 pl-6 text-xs text-muted-foreground/70">
            {event.last_tool_name && (
              <span>
                last: <code className="font-mono">{event.last_tool_name}</code>
              </span>
            )}
            {event.usage.tool_uses !== undefined && (
              <span>{event.usage.tool_uses} tools</span>
            )}
            {event.usage.total_tokens !== undefined && (
              <span>{event.usage.total_tokens.toLocaleString()} tokens</span>
            )}
          </div>
        </div>
      );

    case "task_notification": {
      const isOk = event.status === "completed";
      return (
        <div
          className={`rounded-lg p-2.5 space-y-1 ${isOk ? "bg-emerald-500/10" : "bg-red-500/10"}`}
        >
          <div className="flex items-center gap-2">
            {isOk ? (
              <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            ) : (
              <XCircle className="h-3.5 w-3.5 text-red-400 shrink-0" />
            )}
            <span
              className={`text-sm font-medium ${isOk ? "text-emerald-400" : "text-red-400"}`}
            >
              Task {event.status}
            </span>
          </div>
          {event.summary && (
            <p className="text-xs text-muted-foreground pl-5">
              {event.summary}
            </p>
          )}
        </div>
      );
    }

    case "hook_started":
      return (
        <div className="flex items-center gap-2">
          <Webhook className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground">
            Hook: <code className="font-mono">{event.hook_name}</code>
          </span>
          <Badge variant="outline" className="text-xs font-mono">
            {event.hook_event}
          </Badge>
        </div>
      );

    case "hook_progress":
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Webhook className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
            <span className="text-xs text-muted-foreground font-medium">
              {event.hook_name} running
            </span>
          </div>
          {(event.stdout || event.stderr) && (
            <pre className="text-xs font-mono bg-muted/30 rounded p-2 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
              {[event.stdout, event.stderr].filter(Boolean).join("\n")}
            </pre>
          )}
        </div>
      );

    case "hook_response": {
      const isOk = event.outcome === "success";
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Webhook
              className={`h-3.5 w-3.5 shrink-0 ${isOk ? "text-emerald-400" : "text-red-400"}`}
            />
            <span className="text-xs text-muted-foreground font-medium">
              {event.hook_name}{" "}
              <span className={isOk ? "text-emerald-400" : "text-red-400"}>
                {event.outcome}
              </span>
            </span>
            {event.exit_code !== undefined && (
              <code className="text-xs font-mono text-muted-foreground/70">
                exit {event.exit_code}
              </code>
            )}
          </div>
          {(event.stdout || event.stderr) && (
            <pre className="text-xs font-mono bg-muted/30 rounded p-2 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
              {[event.stdout, event.stderr].filter(Boolean).join("\n")}
            </pre>
          )}
        </div>
      );
    }

    case "status":
      return (
        <div className="flex items-center gap-2.5">
          <Loader2 className="h-4 w-4 text-muted-foreground shrink-0 animate-spin" />
          <span className="text-sm text-muted-foreground">Processing...</span>
        </div>
      );

    default:
      return (
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <Badge variant="secondary" className="text-xs">
              claude
            </Badge>
            <Badge variant="outline" className="text-xs font-mono">
              system:{(event as { subtype: string }).subtype}
            </Badge>
          </div>
          <ExpandableJSON data={event} label="Event details" />
        </div>
      );
  }
}

// ─── Main component ────────────────────────────────────────────────────

export function ChimpActivity() {
  const { chimpId } = useParams<{ chimpId: string }>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [topics, setTopics] = useState<Standards.Topic.Topic[]>([]);

  useEffect(() => {
    if (!chimpId) return;
    fetch(`/api/chimp/${chimpId}/topics`)
      .then((r) => r.json())
      .then((data) => setTopics(data.topics ?? []))
      .catch(() => {});
  }, [chimpId]);

  const { messages, connected, error } = useSSE<ActivityMessage>({
    url: chimpId ? `/api/chimp/${chimpId}/activity` : null,
    sortBy: sortByTimestamp,
    getKey: (msg) => `${msg.id}-${msg.type}-${msg.timestamp}`,
  });

  const isAtBottomRef = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Extract dispatched output IDs from bullhorn-dispatched meta events
  const dispatchedOutputIds = useMemo(() => {
    const ids = new Set<string>();
    for (const msg of messages) {
      if (
        msg.type === "meta" &&
        getMessageType(msg) === "bullhorn-dispatched"
      ) {
        const seq = (msg.data as Record<string, unknown>).outputSequence;
        if (typeof seq === "number") ids.add(`output-${seq}`);
      }
    }
    return ids;
  }, [messages]);

  const visibleMessages = useMemo(
    () => messages.filter((msg) => msg.type !== "meta"),
    [messages],
  );

  const groupedTypes = useMemo(() => {
    const event: string[] = [];
    const output: string[] = [];
    for (const msg of visibleMessages) {
      const list = msg.type === "event" ? event : output;
      if (!list.includes(getMessageType(msg))) list.push(getMessageType(msg));
    }
    return { event: event.sort(), output: output.sort() };
  }, [visibleMessages]);

  const toggleType = (type: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  const filteredMessages = useMemo(
    () =>
      selectedTypes.size === 0
        ? visibleMessages
        : visibleMessages.filter((msg) =>
            selectedTypes.has(getMessageType(msg)),
          ),
    [visibleMessages, selectedTypes],
  );

  // Scroll tracking — 100px threshold from bottom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const check = () => {
      const atBottom = el.scrollHeight - el.clientHeight - el.scrollTop < 100;
      isAtBottomRef.current = atBottom;
      setShowScrollButton(!atBottom);
    };
    el.addEventListener("scroll", check, { passive: true });
    check();
    return () => el.removeEventListener("scroll", check);
  }, []);

  // Auto-scroll when new messages arrive (if already at bottom)
  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll on message count change
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (isAtBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [filteredMessages.length]);

  async function sendMessage() {
    if (!chimpId || !prompt.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/chimp/${chimpId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      if (res.ok) setPrompt("");
    } finally {
      setSending(false);
    }
  }

  if (!chimpId) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Missing chimp ID
      </div>
    );
  }

  const renderEventContent = (data: Protocol.ChimpCommand) => {
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
            <span className="text-sm text-muted-foreground">
              Stop requested
            </span>
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
  };

  const renderOutputContent = (data: Protocol.ChimpOutputMessage) => {
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
          <div className="flex items-center gap-2">
            <Badge
              variant="outline"
              className="text-xs shrink-0 border-blue-500 text-blue-500"
            >
              received
            </Badge>
            <code className="text-xs font-mono">{data.command}</code>
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
          return renderClaudeThought(data.event as SDKMessage);
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
              <span className="text-xs text-muted-foreground">
                Discord reply
              </span>
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
  };

  const renderMessageContent = (msg: ActivityMessage) => {
    switch (msg.type) {
      case "event":
        return renderEventContent(msg.data);
      case "output":
        return renderOutputContent(msg.data);
      case "meta":
        return null;
      case "unknown":
        return <ExpandableJSON data={msg.data} label="Unknown event" />;
    }
  };

  const isFiltering = selectedTypes.size > 0;

  return (
    <div className="max-h-screen bg-background">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link
                to="/"
                className="flex items-center gap-2 text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                <span className="text-sm">Back</span>
              </Link>
              <div className="h-6 w-px bg-border" />
              <h1 className="text-xl font-bold text-circus-crimson">
                🐒 {chimpId}
              </h1>
              {topics.length > 0 && (
                <div className="flex items-center gap-1.5 ml-2">
                  {topics.map((t) => {
                    const key = Standards.Topic.serializeTopic(t);
                    if (t.platform === "github") {
                      return (
                        <Badge
                          key={key}
                          variant="outline"
                          className="text-xs font-mono text-emerald-500 border-emerald-500/30"
                        >
                          {t.owner}/{t.repo}#{t.number}
                        </Badge>
                      );
                    }
                    return (
                      <Badge
                        key={key}
                        variant="outline"
                        className="text-xs font-mono text-muted-foreground border-muted-foreground/30"
                      >
                        {key}
                      </Badge>
                    );
                  })}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              {connected ? (
                <CircleDot className="h-3 w-3 text-emerald-500 animate-pulse" />
              ) : (
                <Loader2 className="h-3 w-3 text-amber-500 animate-spin" />
              )}
              <span className="text-sm text-muted-foreground">
                {connected ? "Live" : error || "Connecting..."}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="container mx-auto px-4 py-6">
        {error && !connected && (
          <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-md">
            <p className="text-sm text-amber-500">{error}</p>
          </div>
        )}

        <div className="flex items-center gap-3 mb-4">
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Filter className="h-3.5 w-3.5" />
                Filter types
                {isFiltering && (
                  <Badge
                    variant="secondary"
                    className="ml-1 px-1.5 py-0 text-xs"
                  >
                    {selectedTypes.size}
                  </Badge>
                )}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="start" className="w-56 p-3">
              {isFiltering && (
                <button
                  type="button"
                  onClick={() => setSelectedTypes(new Set())}
                  className="text-xs text-muted-foreground hover:text-foreground mb-2"
                >
                  Clear all
                </button>
              )}
              {(
                [
                  {
                    label: "Events",
                    color: "text-amber-500",
                    items: groupedTypes.event,
                  },
                  {
                    label: "Output",
                    color: "text-ring",
                    items: groupedTypes.output,
                  },
                ] as const
              ).map(
                ({ label, color, items }) =>
                  items.length > 0 && (
                    <div key={label} className="mb-2">
                      <p className={`text-xs font-medium ${color} mb-1.5`}>
                        {label}
                      </p>
                      <div className="space-y-1.5">
                        {items.map((mt) => (
                          <label
                            key={mt}
                            htmlFor={`filter-${mt}`}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <Checkbox
                              id={`filter-${mt}`}
                              checked={selectedTypes.has(mt)}
                              onCheckedChange={() => toggleType(mt)}
                            />
                            <span className="text-sm font-mono">{mt}</span>
                          </label>
                        ))}
                      </div>
                    </div>
                  ),
              )}
            </PopoverContent>
          </Popover>
          {isFiltering && (
            <span className="text-xs text-muted-foreground">
              {filteredMessages.length} of {messages.length}
            </span>
          )}
        </div>

        <div className="relative">
          <div
            ref={containerRef}
            className="space-y-3 max-h-[calc(100vh-350px)] overflow-y-auto"
          >
            {filteredMessages.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                <span className="text-4xl block mb-3">🎪</span>
                {messages.length === 0 ? (
                  <>
                    <p>The stage is empty</p>
                    <p className="text-sm">
                      Messages will appear here in real-time
                    </p>
                  </>
                ) : (
                  <p>No messages match filters</p>
                )}
              </div>
            ) : (
              filteredMessages.map((msg) => (
                <Card
                  key={`${msg.id}-${msg.type}-${msg.timestamp}`}
                  className={`transition-all duration-200 hover:shadow-md border-l-4 ${
                    msg.type === "event"
                      ? "border-l-amber-500"
                      : "border-l-ring"
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant="secondary"
                          className={`gap-1 ${msg.type === "event" ? "bg-amber-500/20 text-amber-500" : ""}`}
                        >
                          {typeIcons[msg.type]}
                          {msg.type}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="font-mono text-xs gap-1"
                        >
                          {messageTypeIcons[getMessageType(msg)] ?? (
                            <Circle className="h-3.5 w-3.5" />
                          )}
                          {getMessageType(msg)}
                        </Badge>
                      </div>
                      <div className="flex items-center gap-2">
                        {dispatchedOutputIds.has(msg.id) && (
                          <Megaphone className="h-3.5 w-3.5 text-circus-gold" />
                        )}
                        <span className="text-xs text-muted-foreground">
                          {new Date(msg.timestamp).toLocaleTimeString()}
                        </span>
                      </div>
                    </div>
                    <div className="text-foreground">
                      {renderMessageContent(msg)}
                    </div>
                    <div className="mt-2">
                      <ExpandableJSON data={msg.data} label="Raw payload" />
                    </div>
                  </CardContent>
                </Card>
              ))
            )}
          </div>

          {showScrollButton && (
            <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10">
              <Button
                variant="outline"
                size="sm"
                className="gap-1.5 shadow-lg bg-card/90 backdrop-blur-sm"
                onClick={() => {
                  const el = containerRef.current;
                  if (el)
                    el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
                }}
              >
                <ArrowDown className="h-3.5 w-3.5" />
                Scroll to bottom
              </Button>
            </div>
          )}
        </div>
      </main>

      <footer className="sticky bottom-0 border-t border-border bg-card/80 backdrop-blur-sm p-4">
        <div className="container mx-auto flex gap-2">
          <Textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Send a message..."
            className="min-h-10 max-h-40 resize-none"
            disabled={sending}
          />
          <Button
            onClick={sendMessage}
            disabled={sending || !prompt.trim()}
            size="icon"
            className="shrink-0 self-end"
          >
            {sending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </Button>
        </div>
      </footer>
    </div>
  );
}
