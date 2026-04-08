/**
 * Shared error types for Circus
 *
 * Provides type-safe error handling across all packages
 */

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
 * Redis error (from ioredis)
 */
export interface RedisError extends Error {
  command?: string;
  code?: string;
  message: string;
}

/**
 * Check if an error is a Redis error
 */
export function isRedisError(error: unknown): error is RedisError {
  return (
    error instanceof Error &&
    ("command" in error || error.message?.includes("Redis"))
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

/**
 * Format an error for logging
 */
export function formatError(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  return String(error);
}
