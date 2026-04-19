/**
 * Shared logger for Circus
 *
 * Provides consistent logging across all packages using Pino
 */

import pino from "pino";

export type LogLevel = "debug" | "info" | "warn" | "error";

/**
 * Logger interface compatible with Pino
 */
export interface Logger {
  debug(msg: string, ...args: unknown[]): void;
  debug(obj: object, msg?: string, ...args: unknown[]): void;
  info(msg: string, ...args: unknown[]): void;
  info(obj: object, msg?: string, ...args: unknown[]): void;
  warn(msg: string, ...args: unknown[]): void;
  warn(obj: object, msg?: string, ...args: unknown[]): void;
  error(msg: string, ...args: unknown[]): void;
  error(obj: object, msg?: string, ...args: unknown[]): void;
  child(bindings: Record<string, unknown>): Logger;
}

export function createLogger(service: string): Logger {
  const baseLogger = pino({
    level: process.env.LOG_LEVEL || "info",
  });

  return baseLogger.child({ service }) as unknown as Logger;
}

/**
 * Simple no-op logger for testing
 */
export const noopLogger: Logger = {
  debug: () => {},
  info: () => {},
  warn: () => {},
  error: () => {},
  child: () => noopLogger,
};
