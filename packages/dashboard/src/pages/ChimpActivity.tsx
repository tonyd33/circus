import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  ArrowRightLeft,
  BookOpen,
  Bot,
  Brain,
  CheckCircle,
  Circle,
  CircleDot,
  Clock,
  Cog,
  FileBox,
  Filter,
  FolderSync,
  GitBranch,
  GitPullRequestArrow,
  Hash,
  Loader2,
  MessageCircle,
  MessageSquare,
  OctagonX,
  Radio,
  RefreshCw,
  ScrollText,
  Send,
  Sparkles,
  Terminal,
  User,
  XCircle,
  Zap,
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

interface ActivityMessage {
  id: string;
  type: "command" | "output" | "event";
  messageType: string;
  timestamp: string;
  data: Record<string, unknown>;
}

function getString(obj: Record<string, unknown>, key: string): string {
  const val = obj[key];
  return typeof val === "string" ? val : String(val ?? "");
}

function getNumber(
  obj: Record<string, unknown>,
  key: string,
): number | undefined {
  const val = obj[key];
  return typeof val === "number" ? val : undefined;
}

function getRecord(
  obj: Record<string, unknown>,
  key: string,
): Record<string, unknown> {
  const val = obj[key];
  if (typeof val === "object" && val !== null && !Array.isArray(val)) {
    // Safe: we've verified it's a non-null, non-array object
    const record: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val)) {
      record[k] = v;
    }
    return record;
  }
  return {};
}

const messageTypeIcons: Record<string, React.ReactNode> = {
  "agent-message-response": <Brain className="h-3.5 w-3.5" />,
  "send-agent-message": <MessageSquare className="h-3.5 w-3.5" />,
  log: <ScrollText className="h-3.5 w-3.5" />,
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
  "resume-transmogrify": <Sparkles className="h-3.5 w-3.5" />,
  transmogrify: <ArrowRightLeft className="h-3.5 w-3.5" />,
  "chimp-request": <MessageCircle className="h-3.5 w-3.5" />,
  "discord-response": <Hash className="h-3.5 w-3.5" />,
  "github-comment": <GitPullRequestArrow className="h-3.5 w-3.5" />,
  thought: <Brain className="h-3.5 w-3.5" />,
};

const typeIcons: Record<string, React.ReactNode> = {
  command: <Radio className="h-3 w-3" />,
  output: <Sparkles className="h-3 w-3" />,
  event: <Zap className="h-3 w-3" />,
};

const sortByTimestamp = (a: ActivityMessage, b: ActivityMessage) =>
  new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();

export function ChimpActivity() {
  const { chimpId } = useParams<{ chimpId: string }>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);
  const [topics, setTopics] = useState<
    {
      platform: string;
      owner: string;
      repo: string;
      type: string;
      number: number;
    }[]
  >([]);

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

  const groupedTypes = useMemo(() => {
    const command: string[] = [];
    const output: string[] = [];
    const event: string[] = [];
    for (const msg of messages) {
      const list =
        msg.type === "command"
          ? command
          : msg.type === "event"
            ? event
            : output;
      if (!list.includes(msg.messageType)) list.push(msg.messageType);
    }
    return {
      command: command.sort(),
      output: output.sort(),
      event: event.sort(),
    };
  }, [messages]);

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
        ? messages
        : messages.filter((msg) => selectedTypes.has(msg.messageType)),
    [messages, selectedTypes],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const threshold = 100;
    const check = () => {
      const atBottom =
        el.scrollHeight - el.clientHeight - el.scrollTop < threshold;
      isAtBottomRef.current = atBottom;
      setShowScrollButton(!atBottom);
    };
    el.addEventListener("scroll", check, { passive: true });
    check();
    return () => el.removeEventListener("scroll", check);
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: for scrolling
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (isAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
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

  const renderClaudeThought = (
    event: Record<string, unknown>,
    eventType: string | undefined,
  ) => {
    const subtype = event.subtype as string | undefined;

    switch (eventType) {
      case "assistant": {
        const message = event.message as Record<string, unknown> | undefined;
        const model = message?.model as string | undefined;
        const usage = message?.usage as Record<string, unknown> | undefined;
        return (
          <div className="flex items-center gap-2.5">
            <Bot className="h-4 w-4 text-circus-purple shrink-0" />
            <span className="text-sm text-muted-foreground">
              Assistant response
              {model && (
                <span className="font-mono text-xs ml-1.5 opacity-70">
                  ({model})
                </span>
              )}
            </span>
            {usage && (
              <span className="text-xs text-muted-foreground/60 ml-auto tabular-nums">
                {String(usage.input_tokens ?? 0)}↓{" "}
                {String(usage.output_tokens ?? 0)}↑
              </span>
            )}
          </div>
        );
      }
      case "result": {
        const isError = subtype !== "success";
        const cost = event.total_cost_usd as number | undefined;
        const turns = event.num_turns as number | undefined;
        const durationMs = event.duration_ms as number | undefined;
        return (
          <div
            className={`flex items-center gap-2.5 rounded-lg p-2.5 ${isError ? "bg-red-500/10" : "bg-emerald-500/10"}`}
          >
            {isError ? (
              <XCircle className="h-4 w-4 text-red-500 shrink-0" />
            ) : (
              <CheckCircle className="h-4 w-4 text-emerald-500 shrink-0" />
            )}
            <span
              className={`text-sm font-medium ${isError ? "text-red-500" : "text-emerald-500"}`}
            >
              {isError ? `Error: ${subtype}` : "Completed"}
            </span>
            <div className="flex items-center gap-3 ml-auto text-xs text-muted-foreground tabular-nums">
              {turns !== undefined && <span>{turns} turns</span>}
              {durationMs !== undefined && (
                <span>{(durationMs / 1000).toFixed(1)}s</span>
              )}
              {cost !== undefined && <span>${cost.toFixed(4)}</span>}
            </div>
          </div>
        );
      }
      case "user": {
        const content = event.content as string | undefined;
        return (
          <div className="flex items-start gap-2.5">
            <User className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm whitespace-pre-wrap">
              {content || "(user message)"}
            </p>
          </div>
        );
      }
      case "system": {
        switch (subtype) {
          case "api_retry": {
            const attempt = event.attempt as number | undefined;
            const maxRetries = event.max_retries as number | undefined;
            return (
              <div className="flex items-center gap-2.5 bg-amber-500/10 rounded-lg p-2.5">
                <Clock className="h-4 w-4 text-amber-500 shrink-0" />
                <span className="text-sm text-amber-500">
                  API retry {attempt ?? "?"}/{maxRetries ?? "?"}
                </span>
              </div>
            );
          }
          case "compact_boundary":
            return (
              <div className="flex items-center gap-2.5">
                <RefreshCw className="h-4 w-4 text-blue-400 shrink-0" />
                <span className="text-sm text-muted-foreground">
                  Context compacted
                </span>
              </div>
            );
          case "notification": {
            const text = event.text as string | undefined;
            return (
              <div className="flex items-center gap-2.5">
                <Radio className="h-4 w-4 text-blue-400 shrink-0" />
                <span className="text-sm text-muted-foreground">
                  {text || "Notification"}
                </span>
              </div>
            );
          }
          case "memory_recall":
            return (
              <div className="flex items-center gap-2.5">
                <BookOpen className="h-4 w-4 text-purple-400 shrink-0" />
                <span className="text-sm text-muted-foreground">
                  Memory recalled
                </span>
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
                    system:{subtype}
                  </Badge>
                </div>
                <ExpandableJSON data={event} label="Event details" />
              </div>
            );
        }
      }
      case "tool_use_summary": {
        const toolName = event.tool_name as string | undefined;
        return (
          <div className="flex items-center gap-2.5">
            <Terminal className="h-4 w-4 text-circus-gold shrink-0" />
            <code className="text-xs font-mono bg-muted/30 rounded px-2 py-1">
              {toolName || "tool"}
            </code>
          </div>
        );
      }
      case "status": {
        const statusMsg = event.message as string | undefined;
        return (
          <div className="flex items-center gap-2.5">
            <Loader2 className="h-4 w-4 text-muted-foreground shrink-0 animate-spin" />
            <span className="text-sm text-muted-foreground">
              {statusMsg || "Processing..."}
            </span>
          </div>
        );
      }
      default:
        return (
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                claude
              </Badge>
              <Badge variant="outline" className="text-xs font-mono">
                {eventType || "unknown"}
              </Badge>
            </div>
            <ExpandableJSON data={event} label="Event details" />
          </div>
        );
    }
  };

  const renderMessageContent = (msg: ActivityMessage) => {
    const { data } = msg;

    switch (msg.messageType) {
      case "agent-message-response":
        return (
          <div className="bg-muted/50 rounded-lg p-3 prose prose-sm dark:prose-invert max-w-none">
            <Markdown remarkPlugins={[remarkGfm]}>
              {getString(data, "content") || "(empty response)"}
            </Markdown>
          </div>
        );
      case "progress": {
        const pct = getNumber(data, "percentage");
        return (
          <div className="space-y-1.5">
            <span className="text-sm">{getString(data, "message")}</span>
            {pct !== undefined && (
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 rounded-full bg-muted overflow-hidden">
                  <div
                    className="h-full rounded-full bg-amber-500 transition-all duration-300"
                    style={{
                      width: `${Math.min(Math.max(pct, 0), 100)}%`,
                    }}
                  />
                </div>
                <span className="text-xs text-muted-foreground tabular-nums w-8 text-right">
                  {String(pct)}%
                </span>
              </div>
            )}
          </div>
        );
      }
      case "log":
        return (
          <div className="flex items-start gap-2">
            <Badge
              variant="outline"
              className={`text-xs shrink-0 ${
                getString(data, "level") === "error"
                  ? "border-red-500 text-red-500"
                  : getString(data, "level") === "warn"
                    ? "border-amber-500 text-amber-500"
                    : "border-muted-foreground"
              }`}
            >
              {getString(data, "level")}
            </Badge>
            <div className="flex-1 space-y-1">
              <code className="text-xs font-mono bg-muted/30 rounded px-2 py-1 block break-all">
                {getString(data, "message")}
              </code>
              {data.data !== undefined && (
                <ExpandableJSON data={data.data} label="Log data" />
              )}
            </div>
          </div>
        );
      case "artifact":
        return (
          <div className="flex items-center gap-3 bg-muted/30 rounded-lg p-2.5">
            <FileBox className="h-5 w-5 text-ring shrink-0" />
            <div>
              <span className="text-sm font-medium">
                {getString(data, "name") || "Untitled"}
              </span>
              <span className="text-xs text-muted-foreground ml-2">
                {getString(data, "artifactType")}
              </span>
            </div>
          </div>
        );
      case "error":
        return (
          <div className="flex items-start gap-2 bg-red-500/10 rounded-lg p-2.5">
            <AlertTriangle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
            <div className="text-sm">
              <span className="font-medium text-red-500">
                {getString(data, "error")}
              </span>
              {data.command ? (
                <span className="text-muted-foreground ml-1">
                  in{" "}
                  <code className="font-mono text-xs">
                    {getString(data, "command")}
                  </code>
                </span>
              ) : null}
            </div>
          </div>
        );
      case "send-agent-message": {
        const args = getRecord(data, "args");
        return (
          <div className="flex items-start gap-2.5">
            <MessageSquare className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm whitespace-pre-wrap leading-relaxed">
              {getString(args, "prompt") || "(empty prompt)"}
            </p>
          </div>
        );
      }
      case "stop":
        return (
          <div className="flex items-center gap-2.5">
            <OctagonX className="h-4 w-4 text-red-400 shrink-0" />
            <span className="text-sm text-muted-foreground">
              Stop requested
            </span>
          </div>
        );
      case "new-session":
        return (
          <div className="flex items-center gap-2.5">
            <RefreshCw className="h-4 w-4 text-blue-400 shrink-0" />
            <span className="text-sm text-muted-foreground">
              New session started
            </span>
          </div>
        );
      case "clone-repo": {
        const args = getRecord(data, "args");
        return (
          <div className="flex items-center gap-2.5">
            <GitBranch className="h-4 w-4 text-emerald-400 shrink-0" />
            <code className="text-sm font-mono bg-muted/30 rounded px-2 py-1">
              {getString(args, "url")}
              {getString(args, "branch")
                ? ` @ ${getString(args, "branch")}`
                : ""}
            </code>
          </div>
        );
      }
      case "set-working-dir": {
        const args = getRecord(data, "args");
        return (
          <div className="flex items-center gap-2.5">
            <FolderSync className="h-4 w-4 text-blue-400 shrink-0" />
            <code className="text-sm font-mono bg-muted/30 rounded px-2 py-1">
              {getString(args, "path")}
            </code>
          </div>
        );
      }
      case "thought": {
        const brain = getString(data, "brain");
        const event = data.event as Record<string, unknown> | undefined;
        const eventType = event?.type as string | undefined;

        if (brain === "claude" && event) {
          return renderClaudeThought(event, eventType);
        }

        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {brain}
              </Badge>
              <Badge variant="outline" className="text-xs font-mono">
                {eventType || "unknown"}
              </Badge>
            </div>
            {event && <ExpandableJSON data={event} label="Event details" />}
          </div>
        );
      }
      case "transmogrify":
        return (
          <div className="flex items-start gap-2.5 bg-purple-500/10 rounded-lg p-3">
            <ArrowRightLeft className="h-4 w-4 text-purple-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-xs">
                  {getString(data, "fromProfile")}
                </Badge>
                <span className="text-muted-foreground">→</span>
                <Badge className="text-xs bg-purple-500/20 text-purple-500">
                  {getString(data, "targetProfile")}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                {getString(data, "reason")}
              </p>
              {getString(data, "summary") && (
                <p className="text-xs text-muted-foreground/70 italic">
                  {getString(data, "summary")}
                </p>
              )}
            </div>
          </div>
        );
      case "resume-transmogrify": {
        const args = getRecord(data, "args");
        const eventContexts = args.eventContexts as unknown[] | undefined;
        return (
          <div className="flex items-start gap-2.5 bg-gradient-to-r from-purple-500/10 to-circus-gold/10 rounded-lg p-3 border border-purple-500/20">
            <Sparkles className="h-4 w-4 text-circus-gold shrink-0 mt-0.5" />
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-circus-gold">
                  Transmogrify resumed
                </span>
                <Badge variant="outline" className="text-xs">
                  from {getString(args, "fromProfile")}
                </Badge>
              </div>
              <p className="text-sm">{getString(args, "reason")}</p>
              {getString(args, "summary") && (
                <div className="bg-muted/30 rounded p-2 text-sm">
                  <span className="text-xs font-medium text-muted-foreground block mb-1">
                    Predecessor's summary:
                  </span>
                  <p className="whitespace-pre-wrap">
                    {getString(args, "summary")}
                  </p>
                </div>
              )}
              {eventContexts && eventContexts.length > 0 && (
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">
                    {eventContexts.length} event context
                    {eventContexts.length > 1 ? "s" : ""} transferred
                  </span>
                </div>
              )}
            </div>
          </div>
        );
      }
      case "chimp-request":
        return (
          <div className="flex items-start gap-2.5 bg-blue-500/10 rounded-lg p-3">
            <MessageCircle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">→</span>
                <Badge variant="outline" className="text-xs font-mono">
                  {getString(data, "chimpId")}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {getString(data, "profile")}
                </Badge>
              </div>
              <p className="text-sm">{getString(data, "message")}</p>
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
              <p className="text-sm whitespace-pre-wrap">
                {getString(data, "content")}
              </p>
            </div>
          </div>
        );
      case "github-comment":
        return (
          <div className="flex items-start gap-2.5 bg-emerald-500/10 rounded-lg p-3">
            <GitPullRequestArrow className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
            <div className="space-y-1 flex-1">
              <div className="flex items-center gap-2">
                <Badge
                  variant="outline"
                  className="text-xs font-mono text-emerald-500 border-emerald-500/30"
                >
                  {getString(data, "repo")}#{String(data.issueNumber ?? "")}
                </Badge>
              </div>
              <div className="prose prose-sm dark:prose-invert max-w-none">
                <Markdown remarkPlugins={[remarkGfm]}>
                  {getString(data, "content")}
                </Markdown>
              </div>
            </div>
          </div>
        );
      default:
        return <ExpandableJSON data={data} label="Payload" />;
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
                  {topics.map((t) => (
                    <Badge
                      key={`${t.platform}.${t.owner}.${t.repo}.${t.type}.${t.number}`}
                      variant="outline"
                      className="text-xs font-mono text-emerald-500 border-emerald-500/30"
                    >
                      {t.owner}/{t.repo}#{t.number}
                    </Badge>
                  ))}
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
                    label: "Commands",
                    color: "text-amber-500",
                    items: groupedTypes.command,
                  },
                  {
                    label: "Output",
                    color: "text-ring",
                    items: groupedTypes.output,
                  },
                  {
                    label: "Events",
                    color: "text-emerald-500",
                    items: groupedTypes.event,
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
                    msg.type === "command"
                      ? "border-l-amber-500"
                      : msg.type === "event"
                        ? "border-l-emerald-500"
                        : "border-l-ring"
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            msg.type === "command" ? "default" : "secondary"
                          }
                          className={`gap-1 ${
                            msg.type === "command"
                              ? "bg-amber-500/20 text-amber-500"
                              : msg.type === "event"
                                ? "bg-emerald-500/20 text-emerald-500"
                                : ""
                          }`}
                        >
                          {typeIcons[msg.type]}
                          {msg.type}
                        </Badge>
                        <Badge
                          variant="outline"
                          className="font-mono text-xs gap-1"
                        >
                          {messageTypeIcons[msg.messageType] ?? (
                            <Circle className="h-3.5 w-3.5" />
                          )}
                          {msg.messageType}
                        </Badge>
                      </div>
                      <span className="text-xs text-muted-foreground">
                        {new Date(msg.timestamp).toLocaleTimeString()}
                      </span>
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
