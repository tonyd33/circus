import type { Protocol } from "@mnke/circus-shared";
import { Typing } from "@mnke/circus-shared/lib";
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
  Eye,
  FileBox,
  FileText,
  Filter,
  FolderSync,
  GitBranch,
  GitPullRequestArrow,
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

/**
 * Represents a single event message in the chimp's activity log.
 *
 * This is a discriminated union type that can represent three categories of messages:
 *
 * - **"event"**: Commands sent FROM the user TO the chimp (e.g., "send-agent-message", "clone-repo")
 *   Payload: {@link Protocol.ChimpCommand}
 *
 * - **"output"**: Messages FROM the chimp TO the user/dashboard (e.g., responses, progress, logs, errors)
 *   Payload: {@link Protocol.ChimpOutputMessage}
 *
 * - **"meta"**: Internal system events (e.g., "bullhorn-dispatched") used for bookkeeping.
 *   Not displayed to users. Payload: {@link Protocol.MetaEvent}
 *
 * @example
 * // Event: User sends a message to the chimp
 * const eventMsg: ActivityMessage = {
 *   id: "cmd-123",
 *   type: "event",
 *   messageType: "send-agent-message",
 *   timestamp: "2026-04-22T03:10:00Z",
 *   data: { command: "send-agent-message", args: { prompt: "What is x?" } }
 * };
 *
 * @example
 * // Output: Chimp sends a response
 * const outputMsg: ActivityMessage = {
 *   id: "out-456",
 *   type: "output",
 *   messageType: "agent-message-response",
 *   timestamp: "2026-04-22T03:10:05Z",
 *   data: { type: "agent-message-response", content: "The value of x is..." }
 * };
 */
type ActivityMessage =
  | {
      id: string;
      type: "event";
      messageType: string;
      timestamp: string;
      data: Protocol.ChimpCommand;
    }
  | {
      id: string;
      type: "output";
      messageType: string;
      timestamp: string;
      data: Protocol.ChimpOutputMessage;
    }
  | {
      id: string;
      type: "meta";
      messageType: string;
      timestamp: string;
      data: Protocol.MetaEvent;
    };

/**
 * Safely extracts a string value from a record object, with fallback to string coercion.
 *
 * @param obj - The object to extract from
 * @param key - The property key to retrieve
 * @returns The string value, or an empty string if the key is missing or null
 */
function _getString(obj: Record<string, unknown>, key: string): string {
  const val = obj[key];
  return typeof val === "string" ? val : String(val ?? "");
}

/**
 * Safely extracts a numeric value from a record object, with no fallback.
 *
 * @param obj - The object to extract from
 * @param key - The property key to retrieve
 * @returns The numeric value, or undefined if the key is missing, null, or not a number
 */
function getNumber(
  obj: Record<string, unknown>,
  key: string,
): number | undefined {
  const val = obj[key];
  return typeof val === "number" ? val : undefined;
}

/**
 * Safely extracts a nested object from a record, excluding arrays.
 *
 * @param obj - The object to extract from
 * @param key - The property key to retrieve
 * @returns A shallow copy of the nested object if found, or an empty object otherwise
 */
function _getRecord(
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

/**
 * Visual icons for each message type displayed in the activity log.
 *
 * Maps `messageType` values to lucide-react icon components. Used to provide
 * visual context for each message category in the UI.
 *
 * @remarks
 * - Output types (agent-message-response, log, error, progress): represent chimp responses
 * - Event types (send-agent-message, clone-repo, transmogrify): represent user commands
 * - Meta types (new-session, setup-github-auth): represent system configuration
 */
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

/**
 * Visual icons for the top-level message categories.
 *
 * Maps {@link ActivityMessage.type} values to lucide-react icons.
 * Provides quick visual distinction between:
 * - "event": User-initiated commands (Radio icon)
 * - "output": Chimp responses (Sparkles icon)
 * - "meta": System events (not displayed, filtered out in UI)
 */
const typeIcons: Record<string, React.ReactNode> = {
  event: <Radio className="h-3 w-3" />,
  output: <Sparkles className="h-3 w-3" />,
};

/**
 * Comparator function for sorting messages by timestamp (oldest first).
 *
 * @param a - First message to compare
 * @param b - Second message to compare
 * @returns Negative if a is older, positive if b is older, 0 if equal
 */
const sortByTimestamp = (a: ActivityMessage, b: ActivityMessage) =>
  new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime();

/**
 * ChimpActivity component - displays real-time activity feed for a chimp agent.
 *
 * ## Features
 *
 * - **Real-time SSE stream**: Listens to `/api/chimp/:chimpId/activity` for live updates
 * - **Message filtering**: Users can filter by message type (event vs. output, and specific messageTypes)
 * - **Auto-scroll**: Automatically scrolls to bottom when new messages arrive, unless user has scrolled up
 * - **Topic display**: Shows chimp's current GitHub/Discord topic subscriptions
 * - **Message sending**: Provides a textarea to send new messages to the chimp
 *
 * ## State Management
 *
 * | State | Type | Purpose |
 * |-------|------|---------|
 * | `selectedTypes` | `Set<string>` | Tracks which messageType values are enabled in the filter. Empty set = show all. |
 * | `prompt` | `string` | User's message input in the textarea. |
 * | `sending` | `boolean` | Loading state while POST request is in flight. |
 * | `topics` | `Topic[]` | Array of GitHub/Discord topics the chimp is subscribed to. |
 * | `messages` | `ActivityMessage[]` | Raw SSE stream, sorted by timestamp. |
 * | `connected` | `boolean` | SSE connection status (from useSSE hook). |
 * | `error` | `string \| null` | SSE connection error message (from useSSE hook). |
 * | `showScrollButton` | `boolean` | Whether to show "scroll to bottom" button. |
 * | `isAtBottomRef` | `boolean` | Ref tracking if user is at scroll bottom. |
 *
 * ## Filtering Logic
 *
 * **Why filter by messageType?**
 * - The "meta" message type is excluded from UI display entirely (filtered in `visibleMessages`)
 * - Users can toggle specific message types on/off (e.g., hide all "log" messages)
 * - This helps focus on relevant information in a busy activity log
 *
 * **Filter states:**
 * - `selectedTypes` is empty (`size === 0`): Show all messages
 * - `selectedTypes` has items: Show only messages whose messageType is in the set
 *
 * ## Data Flow
 *
 * ```
 * SSE → messages → visibleMessages (filter meta) → groupedTypes (build filter UI)
 *                         ↓
 *                   filteredMessages (apply user filters)
 *                         ↓
 *                      render
 * ```
 */
export function ChimpActivity() {
  const { chimpId } = useParams<{ chimpId: string }>();
  const containerRef = useRef<HTMLDivElement>(null);

  /**
   * Tracks which message types are enabled in the filter.
   *
   * When empty, all messages are shown. When populated, only messages whose
   * `messageType` appears in this set are displayed.
   *
   * @example
   * selectedTypes = new Set(["log", "error"]) // Only show logs and errors
   * selectedTypes = new Set() // Show all types
   */
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());

  /**
   * The user's text input for sending a message to the chimp.
   */
  const [prompt, setPrompt] = useState("");

  /**
   * Loading state while a message POST request is in flight.
   * Used to disable the send button and show loading UI during submission.
   */
  const [sending, setSending] = useState(false);

  /**
   * Topic subscription format: represents a single GitHub issue, PR, or Discord message
   * that the chimp is actively subscribed to (will receive updates for).
   *
   * **Structure:**
   * - `platform`: "github" or "discord"
   * - `owner`: GitHub org name (GitHub only)
   * - `repo`: GitHub repo name (GitHub only)
   * - `type`: "pr" | "issue" (GitHub only)
   * - `number`: PR/issue number (GitHub) or message ID (Discord)
   *
   * **Update flow:**
   * - Fetched once on mount via `/api/chimp/:chimpId/topics`
   * - Updated when chimp calls subscribe_topic() or unsubscribe
   * - Displayed in UI as badges in the header
   */
  const [topics, setTopics] = useState<
    {
      platform: string;
      owner: string;
      repo: string;
      type: string;
      number: number;
    }[]
  >([]);

  /**
   * Fetch topics on mount.
   * Topics represent the chimp's current subscriptions (e.g., GitHub PR #78).
   */
  useEffect(() => {
    if (!chimpId) return;
    fetch(`/api/chimp/${chimpId}/topics`)
      .then((r) => r.json())
      .then((data) => setTopics(data.topics ?? []))
      .catch(() => {});
  }, [chimpId]);

  /**
   * Real-time SSE stream of activity messages from the chimp.
   *
   * The useSSE hook:
   * - Opens an EventSource to `/api/chimp/:chimpId/activity`
   * - Parses each event as an {@link ActivityMessage}
   * - Auto-sorts by timestamp to maintain chronological order
   * - Deduplicates using getKey callback
   * - Provides `connected` and `error` status
   *
   * @see useSSE hook for implementation details
   */
  const { messages, connected, error } = useSSE<ActivityMessage>({
    url: chimpId ? `/api/chimp/${chimpId}/activity` : null,
    sortBy: sortByTimestamp,
    getKey: (msg) => `${msg.id}-${msg.type}-${msg.timestamp}`,
  });

  /**
   * Ref tracking whether user is scrolled to bottom.
   * Used to auto-scroll new messages into view, while respecting user scroll position.
   */
  const isAtBottomRef = useRef(true);

  /**
   * Whether to show the "scroll to bottom" button.
   * Displayed when user scrolls up away from the latest messages.
   */
  const [showScrollButton, setShowScrollButton] = useState(false);

  /**
   * Set of output sequence IDs that have been dispatched to external platforms.
   *
   * Extracted from "bullhorn-dispatched" meta events. Used to mark messages
   * that have been sent to Discord/GitHub with visual indicators.
   */
  const dispatchedOutputIds = useMemo(() => {
    const ids = new Set<string>();
    for (const msg of messages) {
      if (msg.type === "meta" && msg.messageType === "bullhorn-dispatched") {
        const seq = (msg.data as Record<string, unknown>).outputSequence;
        if (typeof seq === "number") ids.add(`output-${seq}`);
      }
    }
    return ids;
  }, [messages]);

  /**
   * Messages filtered to exclude "meta" type.
   *
   * **Why exclude meta?**
   * - Meta events (e.g., "bullhorn-dispatched") are bookkeeping; not user-facing
   * - They're used internally (e.g., dispatchedOutputIds) but not displayed in the activity log
   * - Filtering them here simplifies downstream logic and UI rendering
   */
  const visibleMessages = useMemo(
    () => messages.filter((msg) => msg.type !== "meta"),
    [messages],
  );

  /**
   * Unique message types grouped by top-level type (event vs. output).
   *
   * Used to populate the filter checkboxes in the header:
   * - event.send-agent-message, event.clone-repo, etc.
   * - output.agent-message-response, output.log, output.error, etc.
   *
   * Sorted alphabetically for consistent UI ordering.
   */
  const groupedTypes = useMemo(() => {
    const event: string[] = [];
    const output: string[] = [];
    for (const msg of visibleMessages) {
      const list = msg.type === "event" ? event : output;
      if (!list.includes(msg.messageType)) list.push(msg.messageType);
    }
    return {
      event: event.sort(),
      output: output.sort(),
    };
  }, [visibleMessages]);

  /**
   * Toggle a message type in the filter set.
   *
   * - If type is already selected, remove it (unfilter)
   * - If type is not selected, add it (filter to only this type)
   *
   * @param type - The messageType string to toggle
   */
  const toggleType = (type: string) => {
    setSelectedTypes((prev) => {
      const next = new Set(prev);
      if (next.has(type)) next.delete(type);
      else next.add(type);
      return next;
    });
  };

  /**
   * Messages after applying user-selected type filters.
   *
   * **Filtering logic:**
   * - If `selectedTypes` is empty: return all visible messages (no filter active)
   * - If `selectedTypes` has items: return only messages whose messageType is in the set
   *
   * This allows users to focus on specific message types (e.g., "show only errors and logs").
   */
  const filteredMessages = useMemo(
    () =>
      selectedTypes.size === 0
        ? visibleMessages
        : visibleMessages.filter((msg) => selectedTypes.has(msg.messageType)),
    [visibleMessages, selectedTypes],
  );

  /**
   * Scroll position tracking: monitors if user is at bottom of activity log.
   *
   * **Purpose:**
   * - Tracks user scroll position to decide if new messages should auto-scroll into view
   * - Shows "scroll to bottom" button when user scrolls up
   * - Respects user intent: if they scrolled up to read history, don't force them back down
   *
   * **Threshold:** 100px from bottom = considered "at bottom" (accounts for scrollbar jitter)
   */
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

  /**
   * Auto-scroll effect: scrolls to bottom when new messages arrive (if user is at bottom).
   *
   * Depends on `filteredMessages.length` instead of messages array directly,
   * so that filtered views also trigger auto-scroll appropriately.
   *
   * Only scrolls if user was already at bottom (respects user scroll position).
   */
  // biome-ignore lint/correctness/useExhaustiveDependencies: for scrolling
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    if (isAtBottomRef.current) {
      el.scrollTop = el.scrollHeight;
    }
  }, [filteredMessages.length]);

  /**
   * Send a message to the chimp via POST.
   *
   * **Flow:**
   * 1. Validate: chimpId exists, prompt not empty, not already sending
   * 2. Set sending = true (disables send button, shows loading UI)
   * 3. POST to `/api/chimp/:chimpId/message` with prompt text
   * 4. Clear prompt textarea on success
   * 5. Always set sending = false (finally block)
   *
   * @async
   */
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
        const stopReason = message?.stop_reason as string | undefined;
        const usage = message?.usage as Record<string, unknown> | undefined;
        const content = message?.content as unknown[] | undefined;

        // Extract token counts from usage
        const inputTokens = getNumber(usage ?? {}, "input_tokens") ?? 0;
        const outputTokens = getNumber(usage ?? {}, "output_tokens") ?? 0;
        const cacheCreationTokens =
          getNumber(usage ?? {}, "cache_creation_input_tokens") ?? 0;
        const cacheReadTokens =
          getNumber(usage ?? {}, "cache_read_input_tokens") ?? 0;

        // Parse content blocks (text, tool_use, etc.)
        const contentBlocks = Array.isArray(content)
          ? content.filter(
              (block): block is Record<string, unknown> =>
                typeof block === "object" && block !== null,
            )
          : [];

        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2.5">
              <Bot className="h-4 w-4 text-circus-purple shrink-0" />
              <span className="text-sm font-medium">Assistant response</span>
              {model && (
                <span className="font-mono text-xs bg-muted/50 px-2 py-1 rounded">
                  {model}
                </span>
              )}
              {stopReason && (
                <Badge variant="outline" className="text-xs font-mono">
                  {stopReason}
                </Badge>
              )}
            </div>

            {usage && (
              <div className="flex flex-wrap gap-3 text-xs text-muted-foreground">
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground/70">Input:</span>
                  <span className="font-mono font-medium">{inputTokens}</span>
                  {cacheReadTokens > 0 && (
                    <span className="text-blue-500/70">
                      (+{cacheReadTokens} cached)
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-muted-foreground/70">Output:</span>
                  <span className="font-mono font-medium">{outputTokens}</span>
                  {cacheCreationTokens > 0 && (
                    <span className="text-amber-500/70">
                      (+{cacheCreationTokens} created)
                    </span>
                  )}
                </div>
              </div>
            )}

            {contentBlocks.length > 0 && (
              <div className="space-y-2">
                {contentBlocks.map((block, i) => {
                  const blockType = block.type as string | undefined;
                  if (blockType === "text") {
                    const text = block.text as string | undefined;
                    return text ? (
                      <div
                        key={i}
                        className="bg-muted/50 rounded-lg p-3 prose prose-sm dark:prose-invert max-w-none"
                      >
                        <Markdown remarkPlugins={[remarkGfm]}>{text}</Markdown>
                      </div>
                    ) : null;
                  }
                  if (blockType === "tool_use") {
                    const toolName = block.name as string | undefined;
                    const toolInput = block.input as
                      | Record<string, unknown>
                      | undefined;
                    return (
                      <div
                        key={i}
                        className="bg-muted/30 rounded-lg p-2.5 space-y-1.5"
                      >
                        <div className="flex items-center gap-2">
                          <Terminal className="h-3.5 w-3.5 text-circus-gold shrink-0" />
                          <code className="text-xs font-mono font-medium text-circus-gold">
                            {toolName || "tool_use"}
                          </code>
                        </div>
                        {toolInput && (
                          <ExpandableJSON data={toolInput} label="Input" />
                        )}
                      </div>
                    );
                  }
                  if (blockType === "thinking") {
                    const thinking = block.thinking as string | undefined;
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
                        {thinking ? (
                          <p className="text-sm whitespace-pre-wrap text-muted-foreground leading-relaxed">
                            {thinking}
                          </p>
                        ) : (
                          <p className="text-xs text-muted-foreground/60 italic">
                            (empty)
                          </p>
                        )}
                      </div>
                    );
                  }
                  if (blockType === "redacted_thinking") {
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
                  }
                  // Fallback: show block type and raw JSON
                  return (
                    <div
                      key={i}
                      className="bg-muted/30 rounded-lg p-2.5 space-y-1"
                    >
                      <Badge variant="outline" className="text-xs font-mono">
                        {blockType || "unknown"}
                      </Badge>
                      <ExpandableJSON data={block} label="Block details" />
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      }
      case "result": {
        const isError = subtype !== "success";
        const cost = event.total_cost_usd as number | undefined;
        const turns = event.num_turns as number | undefined;
        const durationMs = event.duration_ms as number | undefined;
        // SDKResultSuccess has `result: string` (final text output)
        const resultText = event.result as string | undefined;
        // SDKResultError has `errors: string[]`
        const errors = Array.isArray(event.errors)
          ? (event.errors as string[])
          : undefined;
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
            {resultText && (
              <div className="bg-muted/50 rounded-lg p-3 prose prose-sm dark:prose-invert max-w-none">
                <Markdown remarkPlugins={[remarkGfm]}>{resultText}</Markdown>
              </div>
            )}
            {errors && errors.length > 0 && (
              <div className="space-y-1">
                {errors.map((err, i) => (
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
        // SDK: SDKUserMessage = { type: 'user', message: MessageParam, ... }
        // MessageParam.content = string | Array<text|image|tool_result|document>
        const msgParam = event.message as Record<string, unknown> | undefined;
        const rawContent = msgParam?.content;

        /** Render a single content block from a user message */
        const renderUserBlock = (
          block: Record<string, unknown>,
          key: number,
        ) => {
          const bt = block.type as string | undefined;
          if (bt === "text") {
            const text = block.text as string | undefined;
            return text ? (
              <p key={key} className="text-sm whitespace-pre-wrap">
                {text}
              </p>
            ) : null;
          }
          if (bt === "tool_result") {
            const toolUseId = block.tool_use_id as string | undefined;
            const isError = block.is_error as boolean | undefined;
            const resultContent = block.content;
            const resultText =
              typeof resultContent === "string"
                ? resultContent
                : Array.isArray(resultContent)
                  ? resultContent
                      .filter(
                        (b): b is Record<string, unknown> =>
                          typeof b === "object" && b !== null,
                      )
                      .filter((b) => b.type === "text")
                      .map((b) => b.text as string)
                      .filter(Boolean)
                      .join("\n")
                  : undefined;
            return (
              <div
                key={key}
                className={`rounded-lg p-2.5 space-y-1.5 ${isError ? "bg-red-500/10 border border-red-500/20" : "bg-emerald-500/10 border border-emerald-500/20"}`}
              >
                <div className="flex items-center gap-2">
                  <Terminal
                    className={`h-3.5 w-3.5 shrink-0 ${isError ? "text-red-400" : "text-emerald-400"}`}
                  />
                  <span className="text-xs font-medium text-muted-foreground">
                    tool result
                  </span>
                  {toolUseId && (
                    <code className="text-xs font-mono text-muted-foreground/70">
                      {toolUseId}
                    </code>
                  )}
                  {isError && (
                    <Badge
                      variant="outline"
                      className="text-xs border-red-500/40 text-red-400"
                    >
                      error
                    </Badge>
                  )}
                </div>
                {resultText && (
                  <pre className="text-xs font-mono bg-muted/30 rounded p-2 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                    {resultText}
                  </pre>
                )}
              </div>
            );
          }
          if (bt === "image") {
            return (
              <div
                key={key}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <Image className="h-3.5 w-3.5 shrink-0" />
                <span>[Image attachment]</span>
              </div>
            );
          }
          if (bt === "document") {
            const title = block.title as string | undefined;
            return (
              <div
                key={key}
                className="flex items-center gap-2 text-xs text-muted-foreground"
              >
                <FileText className="h-3.5 w-3.5 shrink-0" />
                <span>{title ? `Document: ${title}` : "[Document]"}</span>
              </div>
            );
          }
          return (
            <ExpandableJSON key={key} data={block} label={bt ?? "block"} />
          );
        };

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
          const blocks = rawContent.filter(
            (b): b is Record<string, unknown> =>
              typeof b === "object" && b !== null,
          );
          return (
            <div className="space-y-2">
              <div className="flex items-center gap-2">
                <User className="h-4 w-4 text-amber-500 shrink-0" />
                <span className="text-xs text-muted-foreground font-medium">
                  User message
                </span>
              </div>
              <div className="space-y-1.5 pl-6">
                {blocks.map((b, i) => renderUserBlock(b, i))}
              </div>
            </div>
          );
        }
        return (
          <div className="flex items-start gap-2.5">
            <User className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
            <p className="text-sm text-muted-foreground italic">
              (user message)
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
          case "memory_recall": {
            const mode = event.mode as string | undefined;
            const memories = Array.isArray(event.memories)
              ? event.memories
              : [];
            return (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <BookOpen className="h-4 w-4 text-purple-400 shrink-0" />
                  <span className="text-sm text-muted-foreground">
                    Memory recalled
                  </span>
                  {mode && (
                    <Badge variant="outline" className="text-xs font-mono">
                      {mode}
                    </Badge>
                  )}
                  {memories.length > 0 && (
                    <span className="text-xs text-muted-foreground/70">
                      {memories.length} file{memories.length !== 1 ? "s" : ""}
                    </span>
                  )}
                </div>
                {memories.length > 0 && (
                  <div className="pl-6 space-y-0.5">
                    {(memories as Record<string, unknown>[]).map(
                      (m, i) =>
                        typeof m.path === "string" && (
                          <p
                            key={i}
                            className="text-xs font-mono text-muted-foreground/70 truncate"
                          >
                            {m.path}
                          </p>
                        ),
                    )}
                  </div>
                )}
              </div>
            );
          }
          case "init": {
            // SDKSystemMessage: init event with model, tools, mcp_servers, cwd
            const model = event.model as string | undefined;
            const tools = Array.isArray(event.tools)
              ? (event.tools as string[])
              : [];
            const mcpServers = Array.isArray(event.mcp_servers)
              ? (event.mcp_servers as Record<string, unknown>[])
              : [];
            const cwd = event.cwd as string | undefined;
            return (
              <div className="space-y-2">
                <div className="flex items-center gap-2">
                  <Server className="h-4 w-4 text-blue-400 shrink-0" />
                  <span className="text-sm font-medium">
                    Claude initialized
                  </span>
                  {model && (
                    <span className="font-mono text-xs bg-muted/50 px-2 py-1 rounded">
                      {model}
                    </span>
                  )}
                </div>
                <div className="pl-6 space-y-1 text-xs text-muted-foreground">
                  {cwd && (
                    <div className="flex items-center gap-1.5">
                      <FolderSync className="h-3 w-3 shrink-0" />
                      <code className="font-mono">{cwd}</code>
                    </div>
                  )}
                  {tools.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <Cog className="h-3 w-3 shrink-0" />
                      <span>{tools.length} tools</span>
                    </div>
                  )}
                  {mcpServers.length > 0 && (
                    <div className="space-y-0.5">
                      {mcpServers.map((srv, i) => (
                        <div key={i} className="flex items-center gap-1.5">
                          <Webhook className="h-3 w-3 shrink-0" />
                          <span className="font-mono">
                            {String(srv.name ?? "")}
                          </span>
                          <Badge variant="outline" className="text-xs py-0">
                            {String(srv.status ?? "")}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          }
          case "local_command_output": {
            // Slash command output (e.g. /cost, /voice)
            const content = event.content as string | undefined;
            return (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Terminal className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground font-medium">
                    Command output
                  </span>
                </div>
                {content && (
                  <pre className="text-xs font-mono bg-muted/30 rounded p-2 whitespace-pre-wrap break-all max-h-48 overflow-y-auto">
                    {content}
                  </pre>
                )}
              </div>
            );
          }
          case "task_started": {
            const desc = event.description as string | undefined;
            const taskType = event.task_type as string | undefined;
            return (
              <div className="flex items-center gap-2.5">
                <Play className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                <span className="text-sm text-muted-foreground">
                  {desc || "Task started"}
                </span>
                {taskType && (
                  <Badge variant="outline" className="text-xs font-mono">
                    {taskType}
                  </Badge>
                )}
              </div>
            );
          }
          case "task_progress": {
            const desc = event.description as string | undefined;
            const usage = event.usage as Record<string, unknown> | undefined;
            const totalTokens = getNumber(usage ?? {}, "total_tokens");
            const toolUses = getNumber(usage ?? {}, "tool_uses");
            const lastTool = event.last_tool_name as string | undefined;
            return (
              <div className="space-y-1">
                <div className="flex items-center gap-2.5">
                  <ListChecks className="h-3.5 w-3.5 text-blue-400 shrink-0" />
                  <span className="text-sm text-muted-foreground">
                    {desc || "Task in progress"}
                  </span>
                </div>
                <div className="flex flex-wrap gap-3 pl-6 text-xs text-muted-foreground/70">
                  {lastTool && (
                    <span>
                      last: <code className="font-mono">{lastTool}</code>
                    </span>
                  )}
                  {toolUses !== undefined && <span>{toolUses} tools</span>}
                  {totalTokens !== undefined && (
                    <span>{totalTokens.toLocaleString()} tokens</span>
                  )}
                </div>
              </div>
            );
          }
          case "task_notification": {
            const status = event.status as string | undefined;
            const summary = event.summary as string | undefined;
            const isOk = status === "completed";
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
                    Task {status ?? "done"}
                  </span>
                </div>
                {summary && (
                  <p className="text-xs text-muted-foreground pl-5">
                    {summary}
                  </p>
                )}
              </div>
            );
          }
          case "hook_started": {
            const hookName = event.hook_name as string | undefined;
            const hookEvent = event.hook_event as string | undefined;
            return (
              <div className="flex items-center gap-2">
                <Webhook className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                <span className="text-xs text-muted-foreground">
                  Hook:{" "}
                  <code className="font-mono">{hookName || "unknown"}</code>
                </span>
                {hookEvent && (
                  <Badge variant="outline" className="text-xs font-mono">
                    {hookEvent}
                  </Badge>
                )}
              </div>
            );
          }
          case "hook_progress": {
            const hookName = event.hook_name as string | undefined;
            const stdout = event.stdout as string | undefined;
            const stderr = event.stderr as string | undefined;
            return (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Webhook className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
                  <span className="text-xs text-muted-foreground font-medium">
                    {hookName || "hook"} running
                  </span>
                </div>
                {(stdout || stderr) && (
                  <pre className="text-xs font-mono bg-muted/30 rounded p-2 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                    {[stdout, stderr].filter(Boolean).join("\n")}
                  </pre>
                )}
              </div>
            );
          }
          case "hook_response": {
            const hookName = event.hook_name as string | undefined;
            const outcome = event.outcome as string | undefined;
            const exitCode = event.exit_code as number | undefined;
            const stdout = event.stdout as string | undefined;
            const stderr = event.stderr as string | undefined;
            const isOk = outcome === "success";
            return (
              <div className="space-y-1.5">
                <div className="flex items-center gap-2">
                  <Webhook
                    className={`h-3.5 w-3.5 shrink-0 ${isOk ? "text-emerald-400" : "text-red-400"}`}
                  />
                  <span className="text-xs text-muted-foreground font-medium">
                    {hookName || "hook"}{" "}
                    <span
                      className={isOk ? "text-emerald-400" : "text-red-400"}
                    >
                      {outcome ?? "done"}
                    </span>
                  </span>
                  {exitCode !== undefined && (
                    <code className="text-xs font-mono text-muted-foreground/70">
                      exit {exitCode}
                    </code>
                  )}
                </div>
                {(stdout || stderr) && (
                  <pre className="text-xs font-mono bg-muted/30 rounded p-2 whitespace-pre-wrap break-all max-h-32 overflow-y-auto">
                    {[stdout, stderr].filter(Boolean).join("\n")}
                  </pre>
                )}
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
                    system:{subtype}
                  </Badge>
                </div>
                <ExpandableJSON data={event} label="Event details" />
              </div>
            );
        }
      }
      case "tool_use_summary": {
        // SDKToolUseSummaryMessage: { summary: string, preceding_tool_use_ids: string[] }
        const summary = event.summary as string | undefined;
        const ids = Array.isArray(event.preceding_tool_use_ids)
          ? (event.preceding_tool_use_ids as string[])
          : [];
        return (
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <Terminal className="h-4 w-4 text-circus-gold shrink-0" />
              <span className="text-xs text-muted-foreground font-medium">
                Tool use summary
              </span>
              {ids.length > 0 && (
                <span className="text-xs text-muted-foreground/60">
                  ({ids.length} tool{ids.length !== 1 ? "s" : ""})
                </span>
              )}
            </div>
            {summary && (
              <p className="text-sm text-muted-foreground pl-6">{summary}</p>
            )}
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
      case "resume-transmogrify":
        return (
          <div className="flex items-start gap-2.5 bg-gradient-to-r from-purple-500/10 to-circus-gold/10 rounded-lg p-3 border border-purple-500/20">
            <Sparkles className="h-4 w-4 text-circus-gold shrink-0 mt-0.5" />
            <div className="space-y-2 flex-1">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium text-circus-gold">
                  Transmogrify resumed
                </span>
                <Badge variant="outline" className="text-xs">
                  from {data.args.fromProfile}
                </Badge>
              </div>
              <p className="text-sm">{data.args.reason}</p>
              {data.args.summary && (
                <div className="bg-muted/30 rounded p-2 text-sm">
                  <span className="text-xs font-medium text-muted-foreground block mb-1">
                    Predecessor's summary:
                  </span>
                  <p className="whitespace-pre-wrap">{data.args.summary}</p>
                </div>
              )}
              {data.args.eventContexts.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  {data.args.eventContexts.length} event context
                  {data.args.eventContexts.length > 1 ? "s" : ""} transferred
                </span>
              )}
            </div>
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
      case "log":
        return (
          <div className="flex items-start gap-2">
            <Badge
              variant="outline"
              className={`text-xs shrink-0 ${
                data.level === "error"
                  ? "border-red-500 text-red-500"
                  : data.level === "warn"
                    ? "border-amber-500 text-amber-500"
                    : "border-muted-foreground"
              }`}
            >
              {data.level}
            </Badge>
            <div className="flex-1 space-y-1">
              <code className="text-xs font-mono bg-muted/30 rounded px-2 py-1 block break-all">
                {data.message}
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
        const event = data.event as Record<string, unknown> | undefined;
        const eventType = event?.type as string | undefined;

        if (data.brain === "claude" && event) {
          return renderClaudeThought(event, eventType);
        }

        return (
          <div className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge variant="secondary" className="text-xs">
                {data.brain}
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
                  {data.fromProfile}
                </Badge>
                <span className="text-muted-foreground">→</span>
                <Badge className="text-xs bg-purple-500/20 text-purple-500">
                  {data.targetProfile}
                </Badge>
              </div>
              <p className="text-sm text-muted-foreground">{data.reason}</p>
              {data.summary && (
                <p className="text-xs text-muted-foreground/70 italic">
                  {data.summary}
                </p>
              )}
            </div>
          </div>
        );
      case "chimp-request":
        return (
          <div className="flex items-start gap-2.5 bg-blue-500/10 rounded-lg p-3">
            <MessageCircle className="h-4 w-4 text-blue-500 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="text-xs text-muted-foreground">→</span>
                <Badge variant="outline" className="text-xs font-mono">
                  {data.chimpId}
                </Badge>
                <Badge variant="secondary" className="text-xs">
                  {data.profile}
                </Badge>
              </div>
              <p className="text-sm">{data.message}</p>
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
      default:
        return Typing.unreachable(msg);
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
                          className={`gap-1 ${
                            msg.type === "event"
                              ? "bg-amber-500/20 text-amber-500"
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
