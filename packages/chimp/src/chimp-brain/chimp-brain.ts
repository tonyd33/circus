/**
 * Abstract Chimp base class
 *
 * Defines the interface for a Chimp - a worker that processes messages from NATS.
 * Implementations should handle messages and define startup/shutdown behavior.
 */

import { Logger, Protocol } from "@mnke/circus-shared";

/**
 * Publish function for sending output messages
 */
export type PublishFn = (message: Protocol.ChimpOutputMessage) => void;

export abstract class ChimpBrain {
  protected chimpId: string;
  protected model: string;
  protected publish: PublishFn;
  private logger: Logger.Logger;

  constructor(chimpId: string, model: string, publish: PublishFn) {
    this.chimpId = chimpId;
    this.model = model;
    this.publish = publish;
    this.logger = Logger.createLogger("Chimp");
  }

  /**
   * Log locally (Pino) and publish to NATS.
   */
  protected log(
    level: Logger.LogLevel,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    if (data) {
      this.logger[level](data, message);
    } else {
      this.logger[level](message);
    }
    this.publish(Protocol.createLogMessage(level, message, data));
  }

  /**
   * Handle an incoming message
   * @returns "continue" to keep processing messages, "stop" to shutdown
   */
  abstract handleMessage(
    message: Protocol.ChimpCommand,
  ): Promise<"continue" | "stop">;

  /**
   * Called once when the chimp starts up, before processing any messages
   */
  abstract onStartup(): Promise<void>;

  /**
   * Called once when the chimp shuts down, after processing all messages
   */
  abstract onShutdown(): Promise<void>;
}
