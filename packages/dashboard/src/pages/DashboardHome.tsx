import { Standards } from "@mnke/circus-shared";
import { Typing } from "@mnke/circus-shared/lib";
import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useChimps } from "@/hooks/useChimps";
import { useChimpTopics } from "@/hooks/useChimpTopics";
import type { ChimpState } from "@/lib/chimp";

const statusColors: Record<ChimpState["status"], string> = {
  scheduled: "bg-blue-400",
  pending: "bg-yellow-500",
  running: "bg-green-500",
  stopped: "bg-gray-500",
  failed: "bg-red-500",
  unknown: "bg-gray-300",
};

const statusBorders: Record<ChimpState["status"], string> = {
  scheduled: "border-l-blue-400",
  pending: "border-l-yellow-500",
  running: "border-l-green-500",
  stopped: "border-l-gray-500",
  failed: "border-l-red-500",
  unknown: "border-l-gray-300",
};

interface StatusCounts {
  total: number;
  scheduled: number;
  pending: number;
  running: number;
  stopped: number;
  failed: number;
  unknown: number;
}

const initialCounts: StatusCounts = {
  total: 0,
  scheduled: 0,
  pending: 0,
  running: 0,
  stopped: 0,
  failed: 0,
  unknown: 0,
};

function formatRelativeTime(ts: number): string {
  const diff = Math.floor((Date.now() - ts) / 1000);
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const statCards: Array<{
  key: keyof StatusCounts;
  label: string;
  borderClass: string;
  icon: string;
}> = [
  {
    key: "total",
    label: "Total",
    borderClass: "border-l-circus-gold",
    icon: "🎪",
  },
  {
    key: "running",
    label: "Running",
    borderClass: statusBorders.running,
    icon: "🤹",
  },
  {
    key: "pending",
    label: "Pending",
    borderClass: statusBorders.pending,
    icon: "🎯",
  },
  {
    key: "stopped",
    label: "Stopped",
    borderClass: statusBorders.stopped,
    icon: "🎬",
  },
  {
    key: "failed",
    label: "Failed",
    borderClass: statusBorders.failed,
    icon: "💥",
  },
];

/**
 * Displays subscribed topics for a chimp as badges.
 * Topics include GitHub PRs/issues and Discord channels the chimp is subscribed to.
 */
function ChimpTopicsBadges({ topics }: { topics: Standards.Topic.Topic[] }) {
  if (topics.length === 0) {
    return null;
  }

  return (
    <div className="flex items-center gap-1.5">
      {topics.map((t: Standards.Topic.Topic) => {
        const key = Standards.Topic.serializeTopic(t);

        switch (t.platform) {
          case "github":
            return (
              <Badge
                key={key}
                variant="outline"
                className="text-xs font-mono text-emerald-500 border-emerald-500/30"
              >
                {t.owner}/{t.repo}#{t.number}
              </Badge>
            );
          case "discord":
            return (
              <Badge
                key={key}
                variant="outline"
                className="text-xs font-mono text-indigo-500 border-indigo-500/30"
              >
                discord
              </Badge>
            );
          case "direct":
            return (
              <Badge
                key={key}
                variant="outline"
                className="text-xs font-mono text-muted-foreground border-muted-foreground/30"
              >
                direct:{t.chimpId}
              </Badge>
            );
          case "debug":
            return (
              <Badge
                key={key}
                variant="outline"
                className="text-xs font-mono text-amber-500 border-amber-500/30"
              >
                debug:{t.sessionId}
              </Badge>
            );
          default:
            return Typing.unreachable(t);
        }
      })}
    </div>
  );
}

export function DashboardHome() {
  const { chimps, error } = useChimps();
  const { topicsByChimp } = useChimpTopics(chimps.map((c) => c.chimpId));

  const counts = useMemo<StatusCounts>(() => {
    return chimps.reduce<StatusCounts>(
      (acc, chimp) => {
        acc.total += 1;
        acc[chimp.status] += 1;
        return acc;
      },
      { ...initialCounts },
    );
  }, [chimps]);

  const recentChimps = useMemo(() => {
    return [...chimps].sort((a, b) => b.updatedAt - a.updatedAt).slice(0, 8);
  }, [chimps]);

  return (
    <div className="container mx-auto p-4 md:p-8">
      <div className="flex justify-between items-center mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-circus-crimson">
          Ringmaster's View
        </h1>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          Error: {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 md:gap-4 mb-6 md:mb-8">
        {statCards.map(({ key, label, borderClass, icon }) => (
          <Card
            key={key}
            className={`border-l-4 ${borderClass} hover:shadow-md transition-shadow`}
          >
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-1.5">
                <span>{icon}</span>
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{counts[key]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mb-8 border-t-2 border-t-circus-crimson/30">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <span>🎭</span> Recent Activity
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recentChimps.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              🎪 No chimps yet — the circus is quiet.
            </p>
          ) : (
            <div className="space-y-3">
              {recentChimps.map((chimp) => (
                <div key={chimp.chimpId}>
                  <Link
                    to={`/chimps/${chimp.chimpId}/activity`}
                    className="flex items-center gap-3 p-2 rounded-md hover:bg-muted transition-colors"
                  >
                    <span
                      className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusColors[chimp.status]}`}
                    />
                    <span className="font-mono text-sm truncate flex-1">
                      {chimp.chimpId}
                    </span>
                    <Badge variant="outline" className="text-xs">
                      {chimp.profile}
                    </Badge>
                    <Badge variant="secondary" className="text-xs">
                      {chimp.status}
                    </Badge>
                    <span className="text-xs text-muted-foreground whitespace-nowrap">
                      {formatRelativeTime(chimp.updatedAt)}
                    </span>
                  </Link>
                  <ChimpTopicsBadges
                    topics={chimp.topics ?? topicsByChimp[chimp.chimpId] ?? []}
                  />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button
          variant="outline"
          className="border-circus-crimson/30 hover:bg-circus-crimson/5 hover:border-circus-crimson/50"
          asChild
        >
          <Link to="/chimps">View All Chimps →</Link>
        </Button>
      </div>
    </div>
  );
}
