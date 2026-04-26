/**
 * Real-time activity feed for a chimp agent.
 * Streams events and outputs via SSE, with filtering and auto-scroll.
 */

import type { Standards } from "@mnke/circus-shared";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { useSSE } from "@/hooks/useSSE";
import type { ActivityEvent } from "@/lib/chimp";
import { ActivityFeed } from "./chimp-activity/ActivityFeed";
import { getMessageType, sortByTimestamp } from "./chimp-activity/constants";
import { FilterPopover } from "./chimp-activity/FilterPopover";
import { Header } from "./chimp-activity/Header";
import { MessageInput } from "./chimp-activity/MessageInput";

type ActivityMessage = ActivityEvent;

export function ChimpActivity() {
  const { chimpId } = useParams<{ chimpId: string }>();
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());
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

  const _isFiltering = selectedTypes.size > 0;

  if (!chimpId) {
    return (
      <div className="p-4 md:p-8 text-center text-muted-foreground">
        Missing chimp ID
      </div>
    );
  }

  return (
    <div className="h-screen bg-background flex flex-col">
      <Header
        chimpId={chimpId}
        topics={topics}
        connected={connected}
        error={error}
      />

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
            dispatchedOutputIds={dispatchedOutputIds}
            emptyText={
              messages.length === 0
                ? "The stage is empty"
                : "No messages match filters"
            }
            emptySubtitle={
              messages.length === 0
                ? "Messages will appear here in real-time"
                : undefined
            }
          />
        </div>
      </main>

      <MessageInput chimpId={chimpId} />
    </div>
  );
}
