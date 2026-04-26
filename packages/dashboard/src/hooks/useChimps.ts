import type { Standards } from "@mnke/circus-shared";
import { useEffect, useRef, useState } from "react";
import type { ChimpState, ChimpStatus } from "@/lib/chimp";

interface StatusUpdate {
  chimpId: string;
  status: ChimpStatus;
  timestamp: string;
}

interface ProfileUpdate {
  chimpId: string;
  profile: string;
  timestamp: string;
}

interface TopicsUpdate {
  chimpId: string;
  topics: Standards.Topic.Topic[];
  timestamp: string;
}

interface UseChimpsResult {
  chimps: ChimpState[];
  connected: boolean;
  error: string | null;
}

/**
 * Updates an existing chimp in the list, or returns prev unchanged if not found.
 */
function updateChimp(
  prev: ChimpState[],
  chimpId: string,
  updater: (existing: ChimpState) => ChimpState,
): ChimpState[] {
  const idx = prev.findIndex((c) => c.chimpId === chimpId);
  if (idx < 0) return prev;
  const existing = prev[idx];
  if (!existing) return prev;
  const next = [...prev];
  next[idx] = updater(existing);
  return next;
}

export function useChimps(): UseChimpsResult {
  const [chimps, setChimps] = useState<ChimpState[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retryCount = useRef(0);
  const retryTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );

  useEffect(() => {
    let closed = false;

    function connect() {
      if (closed) return;

      const es = new EventSource("/api/chimps/live");

      es.onopen = () => {
        setConnected(true);
        setError(null);
        retryCount.current = 0;
      };

      es.addEventListener("init", (event) => {
        const data = JSON.parse(event.data) as { chimps: ChimpState[] };
        setChimps(data.chimps);
      });

      es.addEventListener("status", (event) => {
        const update = JSON.parse(event.data) as StatusUpdate;
        setChimps((prev) => {
          const idx = prev.findIndex((c) => c.chimpId === update.chimpId);
          if (idx >= 0) {
            return updateChimp(prev, update.chimpId, (existing) => ({
              ...existing,
              status: update.status,
              updatedAt: Date.now(),
            }));
          }
          return [
            ...prev,
            {
              chimpId: update.chimpId,
              profile: "",
              status: update.status,
              createdAt: Date.now(),
              updatedAt: Date.now(),
            },
          ];
        });
      });

      es.addEventListener("profile", (event) => {
        const update = JSON.parse(event.data) as ProfileUpdate;
        setChimps((prev) =>
          updateChimp(prev, update.chimpId, (existing) => ({
            ...existing,
            profile: update.profile,
            updatedAt: Date.now(),
          })),
        );
      });

      es.addEventListener("topics", (event) => {
        const update = JSON.parse(event.data) as TopicsUpdate;
        setChimps((prev) =>
          updateChimp(prev, update.chimpId, (existing) => ({
            ...existing,
            topics: update.topics,
            updatedAt: Date.now(),
          })),
        );
      });

      es.onerror = () => {
        es.close();
        setConnected(false);

        if (closed) return;

        const delay = Math.min(1000 * 2 ** retryCount.current, 30000);
        retryCount.current += 1;
        setError(
          `Connection lost. Retrying in ${Math.round(delay / 1000)}s...`,
        );
        retryTimeout.current = setTimeout(connect, delay);
      };

      return es;
    }

    const es = connect();

    return () => {
      closed = true;
      clearTimeout(retryTimeout.current);
      if (es) es.close();
      setConnected(false);
    };
  }, []);

  return { chimps, connected, error };
}
