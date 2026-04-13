/**
 * Abstract Chimp base class
 *
 * Defines the interface for a Chimp - a worker that processes messages from NATS.
 * Implementations should handle messages and define startup/shutdown behavior.
 */

import {
  createLogger,
  type Logger,
  type LogLevel,
} from "@mnke/circus-shared/logger";
import type {
  ChimpCommand,
  ChimpOutputMessage,
} from "@mnke/circus-shared/protocol";
import { createLogMessage } from "@mnke/circus-shared/protocol";

/**
 * Publish function for sending output messages
 */
export type PublishFn = (message: ChimpOutputMessage) => void;

export abstract class ChimpBrain {
  protected chimpId: string;
  protected publish: PublishFn;
  private logger: Logger;

  constructor(chimpId: string, publish: PublishFn) {
    this.chimpId = chimpId;
    this.publish = publish;
    this.logger = createLogger("Chimp");
  }

  /**
   * Log locally (Pino) and publish to NATS.
   */
  protected log(
    level: LogLevel,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    if (data) {
      this.logger[level](data, message);
    } else {
      this.logger[level](message);
    }
    this.publish(createLogMessage(level, message, data));
  }

  /**
   * Handle an incoming message
   * @returns "continue" to keep processing messages, "stop" to shutdown
   */
  abstract handleMessage(message: ChimpCommand): Promise<"continue" | "stop">;

  /**
   * Called once when the chimp starts up, before processing any messages
   */
  abstract onStartup(): Promise<void>;

  /**
   * Called once when the chimp shuts down, after processing all messages
   */
  abstract onShutdown(): Promise<void>;
}
