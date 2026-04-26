import { ArrowDown } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { ActivityMessage } from "./constants";
import { MessageCard } from "./MessageCard";

export function ActivityFeed({
  messages,
  dispatchedOutputIds,
  emptyText = "No messages match filters",
  emptySubtitle,
}: {
  messages: ActivityMessage[];
  dispatchedOutputIds: Set<string>;
  emptyText?: string;
  emptySubtitle?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prevCountRef = useRef(0);
  const [showScrollButton, setShowScrollButton] = useState(false);

  // Scroll tracking — 300px threshold from bottom
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const check = () => {
      const atBottom = el.scrollHeight - el.clientHeight - el.scrollTop < 300;
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
    if (!isAtBottomRef.current) return;

    const jump = messages.length - prevCountRef.current;
    prevCountRef.current = messages.length;

    // Instant on batch (initial load, filter clear), smooth on incremental
    el.scrollTo({
      top: el.scrollHeight,
      behavior: jump > 2 ? "instant" : "smooth",
    });
  }, [messages.length]);

  return (
    <div className="relative h-full">
      <div ref={containerRef} className="space-y-3 h-full overflow-y-auto">
        {messages.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <span className="text-4xl block mb-3">🎪</span>
            <p>{emptyText}</p>
            {emptySubtitle && <p className="text-sm">{emptySubtitle}</p>}
          </div>
        ) : (
          messages.map((msg) => (
            <MessageCard
              key={`${msg.id}-${msg.type}-${msg.timestamp}`}
              msg={msg}
              dispatchedOutputIds={dispatchedOutputIds}
            />
          ))
        )}
      </div>

      {showScrollButton && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-10">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 rounded-md border bg-card/90 backdrop-blur-sm shadow-lg px-3 py-1.5 text-sm hover:bg-accent transition-colors"
            onClick={() => {
              const el = containerRef.current;
              if (el) el.scrollTo({ top: el.scrollHeight, behavior: "smooth" });
            }}
          >
            <ArrowDown className="h-3.5 w-3.5" />
            Scroll to bottom
          </button>
        </div>
      )}
    </div>
  );
}
