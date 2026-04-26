import { Standards } from "@mnke/circus-shared";
import { ArrowLeft, CircleDot, Loader2 } from "lucide-react";
import { memo } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";

export const Header = memo(function Header({
  chimpId,
  topics,
  connected,
  error,
}: {
  chimpId: string;
  topics: Standards.Topic.Topic[];
  connected: boolean;
  error: string | null;
}) {
  return (
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
  );
});
