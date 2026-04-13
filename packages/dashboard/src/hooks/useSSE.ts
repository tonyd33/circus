import { useEffect, useRef, useState } from "react";

interface UseSSEOptions<T> {
  url: string | null;
  maxMessages?: number;
  sortBy?: (a: T, b: T) => number;
  getKey?: (item: T) => string;
}

interface UseSSEResult<T> {
  messages: T[];
  connected: boolean;
  error: string | null;
}

export function useSSE<T>({
  url,
  maxMessages = 500,
  sortBy,
  getKey,
}: UseSSEOptions<T>): UseSSEResult<T> {
  const [messages, setMessages] = useState<T[]>([]);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const retryCount = useRef(0);
  const retryTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(
    undefined,
  );
  const sortByRef = useRef(sortBy);
  const getKeyRef = useRef(getKey);
  sortByRef.current = sortBy;
  getKeyRef.current = getKey;

  useEffect(() => {
    if (!url) return;

    let closed = false;

    function connect() {
      if (closed) return;

      const eventSource = new EventSource(url!);

      eventSource.onopen = () => {
        setConnected(true);
        setError(null);
        retryCount.current = 0;
      };

      eventSource.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data) as T;
          setMessages((prev) => {
            if (getKeyRef.current) {
              const key = getKeyRef.current(data);
              if (prev.some((m) => getKeyRef.current!(m) === key)) return prev;
            }
            const next = [data, ...prev];
            if (sortByRef.current) next.sort(sortByRef.current);
            return next.slice(0, maxMessages);
          });
        } catch (e) {
          console.error("Failed to parse SSE message:", e);
        }
      };

      eventSource.onerror = () => {
        eventSource.close();
        setConnected(false);

        if (closed) return;

        const delay = Math.min(1000 * 2 ** retryCount.current, 30000);
        retryCount.current += 1;
        setError(
          `Connection lost. Retrying in ${Math.round(delay / 1000)}s...`,
        );
        retryTimeout.current = setTimeout(connect, delay);
      };

      return eventSource;
    }

    const eventSource = connect();

    return () => {
      closed = true;
      clearTimeout(retryTimeout.current);
      if (eventSource) eventSource.close();
      setConnected(false);
    };
  }, [url, maxMessages]);

  return { messages, connected, error };
}
