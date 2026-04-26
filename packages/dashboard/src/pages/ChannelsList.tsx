/**
 * Channels List Page
 */

import { Radio } from "lucide-react";
import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Badge } from "@/components/ui/badge";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";

export interface ChannelInfo {
  channelId: string;
  subscriberCount: number;
}

export function ChannelsList() {
  const [channels, setChannels] = useState<ChannelInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/channels")
      .then((r) => {
        if (!r.ok) throw new Error(`Failed to fetch channels: ${r.status}`);
        return r.json();
      })
      .then((data) => {
        setChannels(data.channels ?? []);
        setLoading(false);
      })
      .catch((e) => {
        setError(e.message);
        setLoading(false);
      });
  }, []);

  return (
    <div className="container mx-auto p-4 md:p-8">
      <div className="flex justify-between items-center mb-6 md:mb-8">
        <h1 className="text-2xl md:text-3xl font-bold text-circus-crimson">
          📻 Channels
        </h1>
      </div>

      {error && (
        <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-4">
          Error: {error}
        </div>
      )}

      {loading ? (
        <p className="text-muted-foreground text-center py-8">Loading...</p>
      ) : channels.length === 0 ? (
        <p className="text-muted-foreground text-center py-8">
          📻 No channels yet — create one to get chimps talking.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {channels.map((channel) => (
            <Link
              key={channel.channelId}
              to={`/channels/${channel.channelId}/activity`}
            >
              <Card className="hover:shadow-lg hover:border-circus-gold/30 transition-all cursor-pointer">
                <CardHeader className="pb-2">
                  <div className="flex items-center gap-2">
                    <Radio className="h-5 w-5 text-cyan-500" />
                    <CardTitle className="text-lg truncate">
                      #{channel.channelId}
                    </CardTitle>
                  </div>
                  <CardDescription>
                    Circus-native chimp communication channel
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <Badge variant="secondary" className="text-xs">
                    {channel.subscriberCount} subscriber
                    {channel.subscriberCount === 1 ? "" : "s"}
                  </Badge>
                </CardContent>
              </Card>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
