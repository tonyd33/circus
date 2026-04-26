import type { Standards } from "@mnke/circus-shared";
import { useEffect, useState } from "react";

interface UseChimpTopicsResult {
  topicsByChimp: Record<string, Standards.Topic.Topic[]>;
  loading: boolean;
  error: string | null;
}

/**
 * Hook to fetch subscribed topics for all chimps.
 *
 * Topics represent GitHub PRs/issues or Discord channels that chimps
 * are actively subscribed to and will receive updates for.
 *
 * Re-fetches whenever the set of known chimp IDs changes so that topics
 * for newly spawned chimps appear without requiring a page refresh.
 *
 * @param chimpIds - Current list of chimp IDs; used as a re-fetch trigger.
 * @returns Object containing topicsByChimp map, loading state, and error message
 *
 * @example
 * const { topicsByChimp, loading } = useChimpTopics(chimps.map(c => c.chimpId));
 * if (loading) return <span>Loading...</span>;
 * Object.entries(topicsByChimp).forEach(([chimpId, topics]) => {
 *   console.log(`${chimpId} has ${topics.length} topics`);
 * });
 */
export function useChimpTopics(chimpIds: string[]): UseChimpTopicsResult {
  const [topicsByChimp, setTopicsByChimp] = useState<
    Record<string, Standards.Topic.Topic[]>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Re-fetch whenever a new chimp ID appears in the list.
  // Sorting + joining gives a stable string key that only changes when
  // the set of IDs changes (not on every render).
  const chimpIdKey = [...chimpIds].sort().join(",");

  useEffect(() => {
    setLoading(true);

    fetch("/api/topics")
      .then((r) => r.json())
      .then((data) => {
        setTopicsByChimp(data.topics ?? {});
        setError(null);
      })
      .catch(() => {
        // Silent error handling - matches dashboard pattern
        setTopicsByChimp({});
        setError(null);
      })
      .finally(() => {
        setLoading(false);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chimpIdKey]);

  return { topicsByChimp, loading, error };
}
