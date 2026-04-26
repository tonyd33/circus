import type * as Opencode from "@opencode-ai/sdk";
import {
  AlertTriangle,
  Bot,
  Brain,
  CheckCircle,
  Circle,
  CircleDot,
  Clock,
  Code,
  FileBox,
  FileText,
  FolderSync,
  ListChecks,
  Loader2,
  OctagonX,
  Play,
  RefreshCw,
  ScrollText,
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

export const OpencodePart = memo(function OpencodePart({
  part,
  index,
}: {
  part: Opencode.Part;
  index: number;
}) {
  switch (part.type) {
    case "text":
      return part.text ? (
        <div
          key={index}
          className="bg-muted/50 rounded-lg p-3 prose prose-sm dark:prose-invert max-w-none"
        >
          <Markdown remarkPlugins={[remarkGfm]}>{part.text}</Markdown>
        </div>
      ) : null;

    case "reasoning":
      return (
        <div
          key={index}
          className="bg-purple-500/10 border border-purple-500/20 rounded-lg p-3 space-y-1.5"
        >
          <div className="flex items-center gap-2">
            <Brain className="h-3.5 w-3.5 text-purple-400 shrink-0" />
            <span className="text-xs font-medium text-purple-400">
              Reasoning
            </span>
            {part.time && (
              <span className="text-xs text-muted-foreground/60 ml-auto font-mono">
                {part.time.end
                  ? `${((part.time.end - part.time.start) / 1000).toFixed(1)}s`
                  : "..."}
              </span>
            )}
          </div>
          {part.text ? (
            <p className="text-sm whitespace-pre-wrap text-muted-foreground leading-relaxed">
              {part.text}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground/60 italic">(empty)</p>
          )}
        </div>
      );

    case "tool":
      return <OpencodeToolPart part={part} index={index} />;

    case "step-start":
      return (
        <div key={index} className="flex items-center gap-2.5">
          <Play className="h-3.5 w-3.5 text-blue-400 shrink-0" />
          <span className="text-xs text-muted-foreground">Step started</span>
        </div>
      );

    case "step-finish":
      return (
        <div
          key={index}
          className="rounded-lg p-2.5 space-y-1.5 bg-muted/30 border border-border/50"
        >
          <div className="flex items-center gap-2">
            <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span className="text-xs font-medium">Step finished</span>
            <Badge variant="outline" className="text-xs font-mono">
              {part.reason}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-3 pl-5 text-xs text-muted-foreground">
            <span>
              cost:{" "}
              <span className="font-mono font-medium">
                ${part.cost.toFixed(4)}
              </span>
            </span>
            <span>
              in:{" "}
              <span className="font-mono font-medium">
                {part.tokens.input.toLocaleString()}
              </span>
            </span>
            <span>
              out:{" "}
              <span className="font-mono font-medium">
                {part.tokens.output.toLocaleString()}
              </span>
            </span>
            {part.tokens.reasoning > 0 && (
              <span>
                reason:{" "}
                <span className="font-mono font-medium">
                  {part.tokens.reasoning.toLocaleString()}
                </span>
              </span>
            )}
            {part.tokens.cache.read > 0 && (
              <span className="text-blue-500/70">
                cache read:{" "}
                <span className="font-mono font-medium">
                  {part.tokens.cache.read.toLocaleString()}
                </span>
              </span>
            )}
            {part.tokens.cache.write > 0 && (
              <span className="text-amber-500/70">
                cache write:{" "}
                <span className="font-mono font-medium">
                  {part.tokens.cache.write.toLocaleString()}
                </span>
              </span>
            )}
          </div>
        </div>
      );

    case "file": {
      const filePath =
        "source" in part && part.source?.type === "file"
          ? part.source.path
          : part.filename;
      return (
        <div key={index} className="flex items-center gap-2.5">
          <FileText className="h-3.5 w-3.5 text-blue-400 shrink-0" />
          <span className="text-xs text-muted-foreground">
            {filePath || part.filename || "[File]"}
          </span>
        </div>
      );
    }

    case "patch":
      return (
        <div key={index} className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Code className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
            <span className="text-xs font-medium">Patch</span>
            <code className="text-xs font-mono text-muted-foreground/50">
              {part.hash.slice(0, 8)}
            </code>
          </div>
          {part.files.length > 0 && (
            <div className="pl-5 space-y-0.5">
              {part.files.map((f, j) => (
                <p
                  key={j}
                  className="text-xs font-mono text-muted-foreground/70 truncate"
                >
                  {f}
                </p>
              ))}
            </div>
          )}
        </div>
      );

    case "snapshot":
      return (
        <div key={index} className="flex items-center gap-2.5">
          <ScrollText className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          <span className="text-xs text-muted-foreground">Snapshot</span>
          <code className="text-xs font-mono text-muted-foreground/50">
            {part.snapshot.slice(0, 12)}
          </code>
        </div>
      );

    case "subtask":
      return (
        <div key={index} className="space-y-1">
          <div className="flex items-center gap-2">
            <Bot className="h-3.5 w-3.5 text-circus-purple shrink-0" />
            <span className="text-xs font-medium">Subtask</span>
            <Badge variant="outline" className="text-xs font-mono">
              {part.agent}
            </Badge>
          </div>
          {part.description && (
            <p className="text-xs text-muted-foreground pl-5">
              {part.description}
            </p>
          )}
        </div>
      );

    case "retry":
      return (
        <div
          key={index}
          className="flex items-center gap-2.5 bg-amber-500/10 rounded-lg p-2.5"
        >
          <RefreshCw className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span className="text-xs text-amber-500">
            Retry attempt {part.attempt}
          </span>
          {part.error && (
            <span className="text-xs text-muted-foreground truncate">
              {"data" in part.error &&
              "message" in (part.error.data as Record<string, unknown>)
                ? String((part.error.data as Record<string, unknown>).message)
                : part.error.name}
            </span>
          )}
        </div>
      );

    case "compaction":
      return (
        <div key={index} className="flex items-center gap-2.5">
          <FolderSync className="h-3.5 w-3.5 text-blue-400 shrink-0" />
          <span className="text-xs text-muted-foreground">
            Context compacted
          </span>
          <Badge variant="outline" className="text-xs">
            {part.auto ? "auto" : "manual"}
          </Badge>
        </div>
      );

    case "agent":
      return (
        <div key={index} className="flex items-center gap-2.5">
          <Bot className="h-3.5 w-3.5 text-circus-purple shrink-0" />
          <span className="text-xs text-muted-foreground">
            Agent: <code className="font-mono">{part.name}</code>
          </span>
        </div>
      );

    default:
      return (
        <ExpandableJSON
          key={index}
          data={part}
          label={(part as { type: string }).type}
        />
      );
  }
});

export const OpencodeToolPart = memo(function OpencodeToolPart({
  part,
  index,
}: {
  part: Opencode.ToolPart;
  index: number;
}) {
  const { state } = part;
  const statusColor = {
    pending: "text-muted-foreground",
    running: "text-blue-400",
    completed: "text-emerald-400",
    error: "text-red-400",
  }[state.status];

  const statusIcon = {
    pending: <Clock className="h-3.5 w-3.5 shrink-0" />,
    running: <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin" />,
    completed: <CheckCircle className="h-3.5 w-3.5 shrink-0" />,
    error: <XCircle className="h-3.5 w-3.5 shrink-0" />,
  }[state.status];

  const title =
    state.status === "completed" || state.status === "running"
      ? state.title
      : undefined;
  const output = state.status === "completed" ? state.output : undefined;
  const error = state.status === "error" ? state.error : undefined;

  return (
    <div
      key={index}
      className={`rounded-lg p-2.5 space-y-1.5 ${
        state.status === "error"
          ? "bg-red-500/10 border border-red-500/20"
          : state.status === "completed"
            ? "bg-muted/30"
            : "bg-muted/20"
      }`}
    >
      <div className="flex items-center gap-2">
        <span className={statusColor}>{statusIcon}</span>
        <code className={`text-xs font-mono font-medium ${statusColor}`}>
          {part.tool}
        </code>
        <Badge variant="outline" className="text-xs font-mono">
          {state.status}
        </Badge>
        {title && (
          <span className="text-xs text-muted-foreground truncate">
            {title}
          </span>
        )}
        <code className="text-xs font-mono text-muted-foreground/40 ml-auto">
          {part.callID.slice(-8)}
        </code>
      </div>

      {state.input && Object.keys(state.input).length > 0 && (
        <ExpandableJSON data={state.input} label="Input" />
      )}

      {output && (
        <pre className="text-xs font-mono bg-black/20 rounded p-2 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
          {output}
        </pre>
      )}

      {error && (
        <pre className="text-xs font-mono bg-red-500/10 text-red-300 rounded p-2 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
          {error}
        </pre>
      )}

      {state.status === "completed" &&
        state.attachments &&
        state.attachments.length > 0 && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground pl-1">
            <FileBox className="h-3 w-3 shrink-0" />
            <span>
              {state.attachments.length} file
              {state.attachments.length !== 1 ? "s" : ""}
            </span>
          </div>
        )}
    </div>
  );
});

export const OpencodeThought = memo(function OpencodeThought({
  event,
}: {
  event: Opencode.Event;
}) {
  switch (event.type) {
    case "message.updated": {
      const { info } = event.properties;
      if (info.role === "assistant") {
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <Bot className="h-4 w-4 text-circus-purple shrink-0" />
              <span className="text-sm font-medium">Assistant response</span>
              <span className="font-mono text-xs bg-muted/50 px-2 py-1 rounded">
                {info.modelID}
              </span>
              {info.finish && (
                <Badge variant="outline" className="text-xs font-mono">
                  {info.finish}
                </Badge>
              )}
            </div>
            <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground/70">Input:</span>
                <span className="font-mono font-medium">
                  {info.tokens.input.toLocaleString()}
                </span>
                {info.tokens.cache.read > 0 && (
                  <span className="text-blue-500/70">
                    (+{info.tokens.cache.read.toLocaleString()} cached)
                  </span>
                )}
              </div>
              <div className="flex items-center gap-1">
                <span className="text-muted-foreground/70">Output:</span>
                <span className="font-mono font-medium">
                  {info.tokens.output.toLocaleString()}
                </span>
                {info.tokens.cache.write > 0 && (
                  <span className="text-amber-500/70">
                    (+{info.tokens.cache.write.toLocaleString()} created)
                  </span>
                )}
              </div>
              {info.tokens.reasoning > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground/70">Reasoning:</span>
                  <span className="font-mono font-medium">
                    {info.tokens.reasoning.toLocaleString()}
                  </span>
                </div>
              )}
              {info.cost > 0 && (
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground/70">Cost:</span>
                  <span className="font-mono font-medium">
                    ${info.cost.toFixed(4)}
                  </span>
                </div>
              )}
            </div>
            {info.error && (
              <div className="flex items-center gap-2 bg-red-500/10 rounded-lg p-2">
                <AlertTriangle className="h-3.5 w-3.5 text-red-400 shrink-0" />
                <span className="text-xs text-red-400">
                  {"data" in info.error &&
                  "message" in (info.error.data as Record<string, unknown>)
                    ? String(
                        (info.error.data as Record<string, unknown>).message,
                      )
                    : info.error.name}
                </span>
              </div>
            )}
          </div>
        );
      }
      return (
        <div className="flex items-center gap-2.5">
          <User className="h-4 w-4 text-amber-500 shrink-0" />
          <span className="text-sm font-medium">User message</span>
        </div>
      );
    }

    case "message.part.updated":
      return <OpencodePart part={event.properties.part} index={0} />;

    case "session.status": {
      const { status } = event.properties;
      if (status.type === "idle") {
        return (
          <div className="flex items-center gap-2.5">
            <Circle className="h-3.5 w-3.5 text-emerald-400 fill-emerald-400 shrink-0" />
            <span className="text-xs text-muted-foreground">Idle</span>
          </div>
        );
      }
      if (status.type === "busy") {
        return (
          <div className="flex items-center gap-2.5">
            <Circle className="h-3.5 w-3.5 text-amber-400 fill-amber-400 shrink-0" />
            <span className="text-xs text-muted-foreground">Busy</span>
          </div>
        );
      }
      // retry
      return (
        <div className="flex items-center gap-2.5 bg-amber-500/10 rounded-lg p-2.5">
          <RefreshCw className="h-3.5 w-3.5 text-amber-500 shrink-0" />
          <span className="text-xs text-amber-500">
            Retry (attempt {status.attempt}): {status.message}
          </span>
        </div>
      );
    }

    case "session.error": {
      const err = event.properties.error;
      const errText =
        err &&
        "data" in err &&
        "message" in (err.data as Record<string, unknown>)
          ? String((err.data as Record<string, unknown>).message)
          : (err?.name ?? "Unknown error");
      return (
        <div className="flex items-start gap-2.5 bg-red-500/10 rounded-lg p-2.5">
          <XCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
          <span className="text-sm text-red-500">{errText}</span>
        </div>
      );
    }

    case "file.edited":
      return (
        <div className="flex items-center gap-2.5">
          <FileText className="h-3.5 w-3.5 text-blue-400 shrink-0" />
          <span className="text-xs text-muted-foreground">
            Edited: <code className="font-mono">{event.properties.file}</code>
          </span>
        </div>
      );

    case "permission.updated":
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <Webhook className="h-3.5 w-3.5 text-amber-400 shrink-0" />
            <span className="text-xs font-medium">Permission request</span>
            <Badge variant="outline" className="text-xs font-mono">
              {event.properties.type}
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground pl-5">
            {event.properties.title}
          </p>
        </div>
      );

    case "permission.replied":
      return (
        <div className="flex items-center gap-2.5">
          <CheckCircle className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
          <span className="text-xs text-muted-foreground">
            Permission:{" "}
            <span className="font-medium">{event.properties.response}</span>
          </span>
        </div>
      );

    case "todo.updated": {
      const todos = event.properties.todos;
      return (
        <div className="space-y-1.5">
          <div className="flex items-center gap-2">
            <ListChecks className="h-3.5 w-3.5 text-blue-400 shrink-0" />
            <span className="text-xs font-medium">Todos updated</span>
            <span className="text-xs text-muted-foreground/60">
              {todos.length} item{todos.length !== 1 ? "s" : ""}
            </span>
          </div>
          {todos.length > 0 && (
            <div className="pl-5 space-y-0.5">
              {todos.slice(0, 5).map((todo, j) => (
                <div key={j} className="flex items-center gap-1.5 text-xs">
                  {todo.status === "completed" ? (
                    <CheckCircle className="h-3 w-3 text-emerald-400 shrink-0" />
                  ) : todo.status === "in_progress" ? (
                    <CircleDot className="h-3 w-3 text-blue-400 shrink-0" />
                  ) : (
                    <Circle className="h-3 w-3 text-muted-foreground/40 shrink-0" />
                  )}
                  <span
                    className={
                      todo.status === "completed"
                        ? "text-muted-foreground/50 line-through"
                        : "text-muted-foreground"
                    }
                  >
                    {todo.content}
                  </span>
                </div>
              ))}
              {todos.length > 5 && (
                <p className="text-xs text-muted-foreground/50">
                  +{todos.length - 5} more
                </p>
              )}
            </div>
          )}
        </div>
      );
    }

    case "command.executed":
      return (
        <div className="flex items-center gap-2.5">
          <Terminal className="h-3.5 w-3.5 text-circus-gold shrink-0" />
          <code className="text-xs font-mono font-medium text-circus-gold">
            {event.properties.name}
          </code>
          {event.properties.arguments && (
            <span className="text-xs text-muted-foreground truncate">
              {event.properties.arguments}
            </span>
          )}
        </div>
      );

    case "session.compacted":
      return (
        <div className="flex items-center gap-2.5">
          <FolderSync className="h-3.5 w-3.5 text-blue-400 shrink-0" />
          <span className="text-xs text-muted-foreground">
            Context compacted
          </span>
        </div>
      );

    case "message.part.removed":
    case "message.removed":
      return (
        <div className="flex items-center gap-2.5">
          <OctagonX className="h-3.5 w-3.5 text-muted-foreground/50 shrink-0" />
          <span className="text-xs text-muted-foreground/60">
            {event.type === "message.removed"
              ? "Message removed"
              : "Part removed"}
          </span>
        </div>
      );

    default:
      return (
        <div className="space-y-1">
          <Badge variant="outline" className="text-xs font-mono">
            {event.type}
          </Badge>
          <ExpandableJSON data={event} label="Event details" />
        </div>
      );
  }
});
