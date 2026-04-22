import type { Standards } from "@mnke/circus-shared";
import { useEffect, useState } from "react";

interface UseChimpTopicsResult {
  topics: Standards.Topic.Topic[];
  loading: boolean;
  error: string | null;
}

/**
 * Hook to fetch subscribed topics for a specific chimp.
 *
 * Topics represent GitHub PRs/issues or Discord channels that a chimp
 * is actively subscribed to and will receive updates for.
 *
 * @param chimpId - The ID of the chimp to fetch topics for (can be null)
 * @returns Object containing topics array, loading state, and error message
 *
 * @example
 * const { topics, loading, error } = useChimpTopics(chimpId);
 * if (loading) return <span>Loading...</span>;
 * return topics.map(t => <Badge>{t.owner}/{t.repo}#{t.number}</Badge>);
 */
export function useChimpTopics(chimpId: string | null): UseChimpTopicsResult {
  const [topics, setTopics] = useState<Standards.Topic.Topic[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    // Skip if no chimpId provided
    if (!chimpId) {
      setTopics([]);
      setError(null);
      return;
    }

    setLoading(true);

    fetch(`/api/chimp/${chimpId}/topics`)
      .then((r) => r.json())
      .then((data) => {
        setTopics(data.topics ?? []);
        setError(null);
      })
      .catch(() => {
        // Silent error handling - matches dashboard pattern
        setTopics([]);
        setError(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, [chimpId]);

  return { topics, loading, error };
}
