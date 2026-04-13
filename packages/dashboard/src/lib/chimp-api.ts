/**
 * Chimps API client
 *
 * Fetches chimp status from dashboard (which proxies to ledger)
 */

const POLL_INTERVAL = 5000;

export interface ChimpState {
  chimpId: string;
  status: "pending" | "running" | "stopped" | "failed" | "unknown";
  createdAt: number;
  updatedAt: number;
}

export async function fetchChimps(): Promise<ChimpState[]> {
  const res = await fetch("/api/chimps");
  if (!res.ok) {
    throw new Error(`Failed to fetch chimps: ${res.status}`);
  }
  const data = await res.json();
  return data.chimps;
}

export async function fetchChimp(id: string): Promise<ChimpState | null> {
  const res = await fetch(`/api/chimp/${id}/status`);
  if (res.status === 404) {
    return null;
  }
  if (!res.ok) {
    throw new Error(`Failed to fetch chimp: ${res.status}`);
  }
  return res.json();
}

export function pollChimps(
  callback: (chimps: ChimpState[]) => void,
  onError: (err: Error) => void,
): () => void {
  const POLL_INTERVAL = 5000;
  let running = true;

  async function poll() {
    if (!running) return;
    try {
      const chimps = await fetchChimps();
      callback(chimps);
    } catch (err) {
      onError(err as Error);
    }
    if (running) {
      setTimeout(poll, POLL_INTERVAL);
    }
  }

  poll();

  return () => {
    running = false;
  };
}
