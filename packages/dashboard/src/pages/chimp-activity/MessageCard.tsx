import { Circle, Megaphone } from "lucide-react";
import { memo } from "react";
import { ExpandableJSON } from "@/components/ExpandableJSON";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import type { ActivityMessage } from "./constants";
import { getMessageType, messageTypeIcons, typeIcons } from "./constants";
import { EventContent } from "./renderers/event-content";
import { OutputContent } from "./renderers/output-content";

function renderMessageContent(msg: ActivityMessage) {
  switch (msg.type) {
    case "event":
      return <EventContent data={msg.data} />;
    case "output":
      return <OutputContent data={msg.data} />;
    case "meta":
      return null;
    case "unknown":
      return <ExpandableJSON data={msg.data} label="Unknown event" />;
  }
}

export const MessageCard = memo(function MessageCard({
  msg,
  dispatchedOutputIds,
}: {
  msg: ActivityMessage;
  dispatchedOutputIds: Set<string>;
}) {
  return (
    <Card
      key={`${msg.id}-${msg.type}-${msg.timestamp}`}
      className={`animate-in fade-in slide-in-from-bottom-2 duration-300 transition-all hover:shadow-md border-l-4 ${
        msg.type === "event" ? "border-l-amber-500" : "border-l-ring"
      }`}
    >
      <CardContent className="p-3 md:p-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 mb-2">
          <div className="flex items-center gap-2 flex-wrap">
            <Badge
              variant="secondary"
              className={`gap-1 ${msg.type === "event" ? "bg-amber-500/20 text-amber-500" : ""}`}
            >
              {typeIcons[msg.type]}
              {msg.type}
            </Badge>
            <Badge variant="outline" className="font-mono text-xs gap-1">
              {messageTypeIcons[getMessageType(msg)] ?? (
                <Circle className="h-3.5 w-3.5" />
              )}
              {getMessageType(msg)}
            </Badge>
          </div>
          <div className="flex items-center gap-2 sm:ml-auto">
            {dispatchedOutputIds.has(msg.id) && (
              <Megaphone className="h-3.5 w-3.5 text-circus-gold" />
            )}
            <span className="text-xs text-muted-foreground">
              {new Date(msg.timestamp).toLocaleTimeString()}
            </span>
          </div>
        </div>
        <div className="text-foreground">{renderMessageContent(msg)}</div>
        <div className="mt-2">
          <ExpandableJSON data={msg.data} label="Raw payload" />
        </div>
      </CardContent>
    </Card>
  );
});
