import {
  AlertTriangle,
  ArrowDown,
  ArrowLeft,
  Circle,
  CircleDot,
  FileBox,
  Filter,
  FolderSync,
  GitBranch,
  Loader2,
  MessageSquare,
  OctagonX,
  RefreshCw,
  Send,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import Markdown from "react-markdown";
import { Link, useParams } from "react-router-dom";
import remarkGfm from "remark-gfm";
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
  type: "input" | "output";
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

const sortByTimestamp = (a: ActivityMessage, b: ActivityMessage) =>
  new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();

export function ChimpActivity() {
  const { profile, chimpId } = useParams<{
    profile: string;
    chimpId: string;
  }>();
  const containerRef = useRef<HTMLDivElement>(null);
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
  const [prompt, setPrompt] = useState("");
  const [sending, setSending] = useState(false);

  const { messages, connected, error } = useSSE<ActivityMessage>({
    url:
      profile && chimpId ? `/api/chimp/${profile}/${chimpId}/activity` : null,
    sortBy: sortByTimestamp,
    getKey: (msg) => `${msg.id}-${msg.type}-${msg.timestamp}`,
  });

  const isAtBottomRef = useRef(true);
  const [showScrollButton, setShowScrollButton] = useState(false);

  const groupedTypes = useMemo(() => {
    const input: string[] = [];
    const output: string[] = [];
    for (const msg of messages) {
      const list = msg.type === "input" ? input : output;
      if (!list.includes(msg.messageType)) list.push(msg.messageType);
    }
    return { input: input.sort(), output: output.sort() };
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
    if (!profile || !chimpId || !prompt.trim() || sending) return;
    setSending(true);
    try {
      const res = await fetch(`/api/chimp/${profile}/${chimpId}/message`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt: prompt.trim() }),
      });
      if (res.ok) setPrompt("");
    } finally {
      setSending(false);
    }
  }

  if (!profile || !chimpId) {
    return (
      <div className="p-8 text-center text-muted-foreground">
        Missing profile or chimp ID
      </div>
    );
  }

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
                <pre className="text-xs font-mono bg-muted/50 rounded px-2 py-1 overflow-x-auto">
                  {JSON.stringify(data.data, null, 2)}
                </pre>
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
      case "opencode-event": {
        const event = data.event as Record<string, unknown> | undefined;
        const eventType = event?.type as string | undefined;
        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-xs font-mono">
                {eventType || "unknown"}
              </Badge>
            </div>
            <pre className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-2 overflow-x-auto max-h-32">
              {JSON.stringify(event, null, 2)}
            </pre>
          </div>
        );
      }
      default:
        return (
          <pre className="text-xs text-muted-foreground bg-muted/30 rounded-lg p-3 overflow-x-auto max-h-48">
            {JSON.stringify(data, null, 2)}
          </pre>
        );
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
              <h1 className="text-xl font-bold text-ring">
                <span className="text-amber-500">⚅</span> Chimp {chimpId}
              </h1>
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
              {groupedTypes.input.length > 0 && (
                <div className="mb-2">
                  <p className="text-xs font-medium text-amber-500 mb-1.5">
                    Input
                  </p>
                  <div className="space-y-1.5">
                    {groupedTypes.input.map((mt) => (
                      <button
                        key={mt}
                        type="button"
                        className="flex items-center gap-2 cursor-pointer"
                        onClick={() => toggleType(mt)}
                      >
                        <Checkbox
                          checked={selectedTypes.has(mt)}
                          onCheckedChange={() => toggleType(mt)}
                        />
                        <span className="text-sm font-mono">{mt}</span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
              {groupedTypes.output.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-ring mb-1.5">Output</p>
                  <div className="space-y-1.5">
                    {groupedTypes.output.map((mt) => (
                      <button
                        key={mt}
                        type="button"
                        className="flex items-center gap-2 cursor-pointer"
                        onClick={() => toggleType(mt)}
                      >
                        <Checkbox
                          checked={selectedTypes.has(mt)}
                          onCheckedChange={() => toggleType(mt)}
                        />
                        <span className="text-sm font-mono">{mt}</span>
                      </button>
                    ))}
                  </div>
                </div>
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
                <Circle className="h-8 w-8 mx-auto mb-3 opacity-50" />
                {messages.length === 0 ? (
                  <>
                    <p>No activity yet</p>
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
                  className={`transition-all duration-200 hover:shadow-md ${
                    msg.type === "input"
                      ? "border-l-4 border-l-amber-500"
                      : "border-l-4 border-l-ring"
                  }`}
                >
                  <CardContent className="p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            msg.type === "input" ? "default" : "secondary"
                          }
                          className={
                            msg.type === "input"
                              ? "bg-amber-500/20 text-amber-500"
                              : ""
                          }
                        >
                          {msg.type}
                        </Badge>
                        <Badge variant="outline" className="font-mono text-xs">
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
