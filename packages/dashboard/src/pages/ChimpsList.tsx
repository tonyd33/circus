/**
 * Chimps List Page
 */

import { CircleDot, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { useChimps } from "@/hooks/useChimps";
import { useChimpTopics } from "@/hooks/useChimpTopics";
import type { ChimpState } from "@/lib/chimp-api";
import type { Standards } from "@mnke/circus-shared";

const statusColors: Record<ChimpState["status"], string> = {
  scheduled: "bg-blue-400",
  pending: "bg-yellow-500",
  running: "bg-green-500",
  stopped: "bg-gray-500",
  failed: "bg-red-500",
  unknown: "bg-gray-300",
};

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

/**
 * Displays subscribed topics for a chimp as badges.
 * Topics include GitHub PRs/issues and Discord channels the chimp is subscribed to.
 */
function ChimpTopicsBadges({
  chimpId,
  chimpTopics,
}: {
  chimpId: string;
  chimpTopics: Standards.Topic.Topic[];
}) {
  if (chimpTopics.length === 0) {
    return null;
  }

  return (
    <div className="flex flex-wrap gap-1.5 mt-3">
      {chimpTopics.map((t) => {
        const key =
          t.platform === "github"
            ? `${t.platform}.${t.owner}.${t.repo}.${t.type}.${t.number}`
            : `${t.platform}.${t.guildId}.${t.channelId}.${t.interactionId}`;

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

        // Discord topics - shown as simple badge
        return (
          <Badge
            key={key}
            variant="outline"
            className="text-xs font-mono text-indigo-500 border-indigo-500/30"
          >
            discord
          </Badge>
        );
      })}
    </div>
  );
}

export function ChimpsList() {
  const { chimps, connected, error } = useChimps();
  // Fetch topics for all chimps in a single API call
  const { topicsByChimp, loading: topicsLoading } = useChimpTopics();

  return (
    <div className="container mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold text-circus-crimson">🐒 Chimps</h1>
        <div className="flex items-center gap-2">
          {connected ? (
            <CircleDot className="h-3 w-3 text-emerald-500 animate-pulse" />
          ) : (
            <Loader2 className="h-3 w-3 text-amber-500 animate-spin" />
          )}
          <span className="text-sm text-muted-foreground">
            {connected ? "Live" : "Connecting..."}
          </span>
        </div>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          Error: {error}
        </div>
      )}

      {chimps.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">
          🎪 The tent is empty — no chimps performing yet.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {chimps.map((chimp) => (
            <Link key={chimp.chimpId} to={`/chimps/${chimp.chimpId}/activity`}>
              <Card className="hover:shadow-lg hover:border-circus-gold/30 transition-all cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-3 h-3 rounded-full ${statusColors[chimp.status]}`}
                    />
                    <CardTitle className="text-lg">{chimp.chimpId}</CardTitle>
                  </div>
                  <CardDescription className="flex items-center gap-2">
                    {chimp.status}
                    <Badge variant="outline" className="text-xs">
                      {chimp.profile}
                    </Badge>
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Created: {formatTime(chimp.createdAt)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Updated: {formatTime(chimp.updatedAt)}
                  </p>
                  {!topicsLoading && topicsByChimp && (
                    <ChimpTopicsBadges
                      chimpId={chimp.chimpId}
                      chimpTopics={topicsByChimp[chimp.chimpId] ?? []}
                    />
                  )}
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
