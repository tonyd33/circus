import { useMemo } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { useChimps } from "@/hooks/useChimps";
import type { ChimpState } from "@/lib/chimp-api";

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
}> = [
  {
    key: "total",
    label: "Total",
    borderClass: "border-l-[color:var(--circus-gold)]",
  },
  { key: "running", label: "Running", borderClass: statusBorders.running },
  { key: "pending", label: "Pending", borderClass: statusBorders.pending },
  { key: "stopped", label: "Stopped", borderClass: statusBorders.stopped },
  { key: "failed", label: "Failed", borderClass: statusBorders.failed },
];

export function DashboardHome() {
  const { chimps, error } = useChimps();

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
    <div className="container mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">
          <span className="mr-2">🎪</span>
          Circus Dashboard
        </h1>
        <span className="text-sm text-muted-foreground">Auto-refresh: 5s</span>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          Error: {error}
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4 mb-8">
        {statCards.map(({ key, label, borderClass }) => (
          <Card key={key} className={`border-l-4 ${borderClass}`}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground">
                {label}
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{counts[key]}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mb-8">
        <CardHeader>
          <CardTitle>Recent Activity</CardTitle>
        </CardHeader>
        <CardContent>
          {recentChimps.length === 0 ? (
            <p className="text-muted-foreground text-center py-4">
              🎪 No chimps yet — the circus is quiet.
            </p>
          ) : (
            <div className="space-y-3">
              {recentChimps.map((chimp) => (
                <Link
                  key={chimp.chimpId}
                  to={`/chimps/${chimp.profile}/${chimp.chimpId}/activity`}
                  className="flex items-center gap-3 p-2 rounded-md hover:bg-muted transition-colors"
                >
                  <span
                    className={`w-2.5 h-2.5 rounded-full shrink-0 ${statusColors[chimp.status]}`}
                  />
                  <span className="font-mono text-sm truncate flex-1">
                    {chimp.chimpId}
                  </span>
                  <Badge variant="secondary" className="text-xs">
                    {chimp.status}
                  </Badge>
                  <span className="text-xs text-muted-foreground whitespace-nowrap">
                    {formatRelativeTime(chimp.updatedAt)}
                  </span>
                </Link>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <div className="flex gap-4">
        <Button variant="outline" asChild>
          <Link to="/chimps">View All Chimps →</Link>
        </Button>
      </div>
    </div>
  );
}
