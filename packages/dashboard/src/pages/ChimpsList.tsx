/**
 * Chimps List Page
 */

import { CircleDot, Loader2 } from "lucide-react";
import { Link } from "react-router-dom";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
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

function formatTime(ts: number): string {
  return new Date(ts).toLocaleString();
}

export function ChimpsList() {
  const { chimps, connected, error } = useChimps();

  return (
    <div className="container mx-auto p-8">
      <div className="flex justify-between items-center mb-8">
        <h1 className="text-3xl font-bold">Chimps</h1>
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
        <p className="text-muted-foreground">No chimps found.</p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {chimps.map((chimp) => (
            <Link
              key={chimp.chimpId}
              to={`/chimps/${chimp.profile}/${chimp.chimpId}/activity`}
            >
              <Card className="hover:shadow-lg transition-shadow cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-3 h-3 rounded-full ${statusColors[chimp.status]}`}
                    />
                    <CardTitle className="text-lg">{chimp.chimpId}</CardTitle>
                  </div>
                  <CardDescription>{chimp.status}</CardDescription>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-muted-foreground">
                    Created: {formatTime(chimp.createdAt)}
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Updated: {formatTime(chimp.updatedAt)}
                  </p>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
