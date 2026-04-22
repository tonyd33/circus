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
 * @returns Object containing topicsByChimp map, loading state, and error message
 *
 * @example
 * const { topicsByChimp, loading } = useChimpTopics();
 * if (loading) return <span>Loading...</span>;
 * Object.entries(topicsByChimp).forEach(([chimpId, topics]) => {
 *   console.log(`${chimpId} has ${topics.length} topics`);
 * });
 */
export function useChimpTopics(): UseChimpTopicsResult {
  const [topicsByChimp, setTopicsByChimp] = useState<
    Record<string, Standards.Topic.Topic[]>
  >({});
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
  }, []);

  return { topicsByChimp, loading, error };
}
