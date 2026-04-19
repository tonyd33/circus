import type { JetStreamManager, StreamConfig } from "nats";

/**
 * NATS error (from nats.js library)
 */
export interface NatsError extends Error {
  code?: string | number;
  message: string;
}

/**
 * Check if an error is a NATS error
 */
export function isNatsError(error: unknown): error is NatsError {
  return (
    error instanceof Error &&
    ("code" in error || error.message?.includes("nats"))
  );
}

/**
 * Check if a NATS error indicates a resource not found
 */
export function isNatsNotFound(error: unknown): boolean {
  if (!isNatsError(error)) return false;
  return (
    error.code === "404" ||
    error.code === 404 ||
    error.message?.includes("not found")
  );
}

/**
 * Check if a NATS error indicates a resource already exists
 */
export function isNatsAlreadyExists(error: unknown): boolean {
  if (!isNatsError(error)) return false;
  return (
    error.message?.includes("already exists") ||
    error.message?.includes("name already in use")
  );
}

export async function ensureStream(
  jsm: JetStreamManager,
  config: Partial<StreamConfig>,
): Promise<void> {
  const streamName = config.name;
  if (!streamName) {
    throw new Error("Stream config must include a name");
  }

  try {
    await jsm.streams.info(streamName);
    return;
  } catch (error) {
    if (!isNatsNotFound(error)) {
      throw error;
    }
  }

  try {
    await jsm.streams.add(config);
  } catch (error) {
    if (isNatsAlreadyExists(error)) {
      return;
    }
    throw error;
  }
}
