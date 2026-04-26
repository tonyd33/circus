/**
 * Real-time activity feed for a channel.
 * Streams events via SSE. Shows all events published to the channel,
 * regardless of which chimp receives them.
 */

import { useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useSSE } from "@/hooks/useSSE";
import type { ActivityEvent } from "@/lib/chimp";
import { ActivityFeed } from "./chimp-activity/ActivityFeed";
import { getMessageType, sortByTimestamp } from "./chimp-activity/constants";
import { FilterPopover } from "./chimp-activity/FilterPopover";

export function ChannelActivity() {
  const { channelId } = useParams<{ channelId: string }>();
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());

  const { messages, connected, error } = useSSE<ActivityEvent>({
    url: channelId ? `/api/channels/${channelId}/activity` : null,
    sortBy: sortByTimestamp,
    getKey: (msg) => `${msg.id}-${msg.type}-${msg.timestamp}`,
  });

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

  if (!channelId) {
    return (
      <div className="p-4 md:p-8 text-center text-muted-foreground">
        Missing channel ID
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col">
      <header className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-3 md:px-4 py-3 md:py-4">
          <div className="flex items-center justify-between gap-3">
            <h1 className="text-lg md:text-xl font-bold text-circus-crimson truncate">
              📻 <span className="truncate">#{channelId}</span>
            </h1>
            <div className="flex items-center gap-2 shrink-0">
              {connected ? (
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500 animate-pulse" />
              ) : (
                <span className="h-2.5 w-2.5 rounded-full bg-amber-500 animate-pulse" />
              )}
              <span className="text-xs md:text-sm text-muted-foreground">
                {connected ? "Live" : error || "Connecting..."}
              </span>
            </div>
          </div>
        </div>
      </header>

      <main className="flex-1 container mx-auto px-3 md:px-4 py-4 md:py-6 overflow-hidden flex flex-col">
        {error && !connected && (
          <div className="mb-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-md">
            <p className="text-sm text-amber-500">{error}</p>
          </div>
        )}

        <FilterPopover
          selectedTypes={selectedTypes}
          groupedTypes={groupedTypes}
          onToggle={toggleType}
          onClear={() => setSelectedTypes(new Set())}
          messageCount={filteredMessages.length}
          totalCount={messages.length}
        />

        <div className="flex-1 overflow-hidden">
          <ActivityFeed
            messages={filteredMessages}
            dispatchedOutputIds={new Set()}
            emptyText={
              messages.length === 0
                ? "The channel is quiet"
                : "No messages match filters"
            }
            emptySubtitle={
              messages.length === 0
                ? "Events will appear here in real-time"
                : undefined
            }
          />
        </div>
      </main>
    </div>
  );
}
