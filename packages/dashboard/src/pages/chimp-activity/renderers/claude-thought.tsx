import type {
  SDKAssistantMessage,
  SDKMessage,
  SDKUserMessage,
} from "@anthropic-ai/claude-agent-sdk";
import {
  BookOpen,
  Bot,
  Brain,
  CheckCircle,
  Clock,
  Code,
  Cog,
  Eye,
  FileText,
  FolderSync,
  Globe,
  Image,
  ListChecks,
  Loader2,
  Play,
  Radio,
  RefreshCw,
  Search,
  Server,
  Terminal,
  User,
  Webhook,
  XCircle,
} from "lucide-react";
import { memo } from "react";
import Markdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { ExpandableJSON } from "@/components/ExpandableJSON";
import { Badge } from "@/components/ui/badge";

export type ContentBlock = SDKAssistantMessage["message"]["content"][number];
export type ContentBlockParam = Extract<
  SDKUserMessage["message"]["content"],
  unknown[]
>[number];

const ContentBlockRenderer = memo(function ContentBlockRenderer({
  block,
  index,
}: {
  block: ContentBlock;
  index: number;
}) {
  switch (block.type) {
    case "text":
      return block.text ? (
        <div
          key={index}
          className="bg-muted/50 rounded-lg p-3 prose prose-sm dark:prose-invert max-w-none"
        >
          <Markdown remarkPlugins={[remarkGfm]}>{block.text}</Markdown>
        </div>
      ) : null;

    case "tool_use": {
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
          <div key={index} className="bg-muted/30 rounded-lg p-2.5 space-y-1.5">
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
        <div key={index} className="bg-muted/30 rounded-lg p-2.5 space-y-1.5">
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
          key={index}
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
          key={index}
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
        <div key={index} className="bg-muted/30 rounded-lg p-2.5 space-y-1.5">
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
          key={index}
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
          key={index}
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
            key={index}
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
            key={index}
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
      return (
        <div key={index} className="rounded-lg p-2.5 space-y-1.5 bg-muted/30">
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
          key={index}
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
          key={index}
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
        <div key={index} className="bg-muted/30 rounded-lg p-2.5 space-y-1.5">
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
          key={index}
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
        <div key={index} className="bg-muted/30 rounded-lg p-2.5 space-y-1">
          <Badge variant="outline" className="text-xs font-mono">
            {(block as { type: string }).type}
          </Badge>
          <ExpandableJSON data={block} label="Block details" />
        </div>
      );
  }
});

const UserBlock = memo(function UserBlock({
  block,
  index,
  toolUseResult,
}: {
  block: ContentBlockParam;
  index: number;
  toolUseResult: unknown;
}) {
  switch (block.type) {
    case "text":
      return block.text ? (
        <p key={index} className="text-sm whitespace-pre-wrap">
          {block.text}
        </p>
      ) : null;

    case "tool_result": {
      const tur = toolUseResult as Record<string, unknown> | undefined;
      const stdout = typeof tur?.stdout === "string" ? tur.stdout : undefined;
      const stderr = typeof tur?.stderr === "string" ? tur.stderr : undefined;
      const isImage = tur?.isImage === true;
      const interrupted = tur?.interrupted === true;

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
          key={index}
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
          key={index}
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
          key={index}
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
          key={index}
          data={block}
          label={(block as { type: string }).type}
        />
      );
  }
});

const SystemOrFallback = memo(function SystemOrFallback({
  event,
}: {
  event: SDKMessage;
}) {
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
});

export const ClaudeThought = memo(function ClaudeThought({
  event,
}: {
  event: SDKMessage;
}) {
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
              {message.content.map((block, i) => (
                <ContentBlockRenderer key={i} block={block} index={i} />
              ))}
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
              {(rawContent as ContentBlockParam[]).map((block, i) => (
                <UserBlock
                  key={i}
                  block={block}
                  index={i}
                  toolUseResult={event.tool_use_result}
                />
              ))}
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
      return <SystemOrFallback event={event} />;
  }
});
