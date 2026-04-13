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
  child(bindings: pino.Bindings): Logger;
}

/**
 * Create a logger for a specific component
 *
 * @param component - Component name (e.g., "Usher", "Ringmaster", "Chimp")
 * @returns Pino logger instance with component context
 *
 * @example
 * const logger = createLogger("Usher");
 * logger.info("Connected to NATS", { url: natsUrl });
 * // Output: {"level":30,"time":1234567890,"component":"Usher","msg":"Connected to NATS","url":"nats://..."}
 *
 * @example
 * logger.info({ url: natsUrl }, "Connected to NATS");
 * // Output: {"level":30,"time":1234567890,"component":"Usher","url":"nats://...","msg":"Connected to NATS"}
 */
export function createLogger(component: string): Logger {
  // Create base logger with pretty printing in development
  const baseLogger = pino({
    level: process.env.LOG_LEVEL || "info",
  });

  // Create child logger with component context
  return baseLogger.child({ component }) as unknown as Logger;
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
