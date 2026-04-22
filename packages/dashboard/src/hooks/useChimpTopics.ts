import type { Standards } from "@mnke/circus-shared";
import { useEffect, useState } from "react";

interface UseChimpTopicsResult {
  topics: Standards.Topic.Topic[];
  topicsByChimp?: Record<string, Standards.Topic.Topic[]>;
  loading: boolean;
  error: string | null;
}

/**
 * Hook to fetch subscribed topics for a specific chimp or all chimps.
 *
 * Topics represent GitHub PRs/issues or Discord channels that a chimp
 * is actively subscribed to and will receive updates for.
 *
 * @param chimpId - The ID of the chimp to fetch topics for (null to fetch all chimps at once)
 * @returns Object containing topics array, loading state, and error message.
 *          When chimpId is null, also includes topicsByChimp with topics keyed by chimpId
 *
 * @example
 * // Fetch topics for a specific chimp
 * const { topics, loading } = useChimpTopics(chimpId);
 *
 * // Fetch topics for all chimps in one API call
 * const { topicsByChimp, loading } = useChimpTopics(null);
 */
export function useChimpTopics(chimpId: string | null): UseChimpTopicsResult {
  const [topics, setTopics] = useState<Standards.Topic.Topic[]>([]);
  const [topicsByChimp, setTopicsByChimp] = useState<
    Record<string, Standards.Topic.Topic[]> | undefined
  >();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Skip if no data requested
    if (chimpId === undefined) {
      setTopics([]);
      setError(null);
      return;
    }

    setLoading(true);

    const endpoint = chimpId ? `/api/chimp/${chimpId}/topics` : "/api/topics";

    fetch(endpoint)
      .then((r) => r.json())
      .then((data) => {
        if (chimpId) {
          // Single chimp response: { topics: Topic[] }
          setTopics(data.topics ?? []);
          setTopicsByChimp(undefined);
        } else {
          // All chimps response: { topics: { [chimpId]: Topic[] } }
          // Store both the raw mapping and a flattened array for backwards compatibility
          const allChimpTopics = data.topics ?? {};
          setTopicsByChimp(allChimpTopics);
          const allTopics = Object.values(allChimpTopics).flat();
          setTopics(allTopics);
        }
        setError(null);
      })
      .catch(() => {
        // Silent error handling - matches dashboard pattern
        setTopics([]);
        setTopicsByChimp(undefined);
        setError(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [chimpId]);

  return { topics, topicsByChimp, loading, error };
}
