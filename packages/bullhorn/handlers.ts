/**
 * Output Handlers for Bullhorn
 *
 * Handlers process chimp output messages and send them to their destinations
 * (e.g., Slack, GitHub, Discord, console logging)
 */

import type { Logger, Protocol } from "@mnke/circus-shared";
import { Typing } from "@mnke/circus-shared/lib";

/**
 * Interface for handling chimp output messages
 */
export interface OutputHandler {
  /**
   * Handle an output message from a chimp
   * @param chimpName - Name of the chimp that sent the message
   * @param message - The output message
   */
  handle(
    chimpName: string,
    message: Protocol.ChimpOutputMessage,
  ): Promise<void>;

  /**
   * Optional: Initialize the handler (e.g., connect to external services)
   */
  initialize?(): Promise<void>;

  /**
   * Optional: Clean up resources when shutting down
   */
  cleanup?(): Promise<void>;
}

/**
 * Console Logger Handler
 *
 * Simple handler that logs all chimp output messages to console using Pino logger
 */
export class ConsoleLoggerHandler implements OutputHandler {
  private logger;

  constructor(logger: Logger.Logger) {
    this.logger = logger;
  }

  async handle(
    chimpName: string,
    message: Protocol.ChimpOutputMessage,
  ): Promise<void> {
    // Log based on message type
    switch (message.type) {
      case "agent-message-response":
        this.logger.info(
          { chimpName, sessionId: message.sessionId },
          `[${chimpName}] Agent response: ${message.content}`,
        );
        break;

      case "artifact":
        this.logger.info(
          {
            chimpName,
            artifactType: message.artifactType,
            name: message.name,
            metadata: message.metadata,
          },
          `[${chimpName}] Artifact created: ${message.name} (${message.artifactType})`,
        );
        break;

      case "progress":
        this.logger.info(
          {
            chimpName,
            percentage: message.percentage,
          },
          `[${chimpName}] Progress: ${message.message}${message.percentage !== undefined ? ` (${message.percentage}%)` : ""}`,
        );
        break;

      case "log": {
        const logLevel = message.level;
        this.logger[logLevel](
          { chimpName, timestamp: message.timestamp, ...message.data },
          `[${chimpName}] ${message.message}`,
        );
        break;
      }

      case "error":
        this.logger.error(
          {
            chimpName,
            command: message.command,
            details: message.details,
          },
          `[${chimpName}] Error: ${message.error}`,
        );
        break;

      case "opencode-event":
        this.logger.error(
          {
            chimpName,
          },
          `[${chimpName}] Event: ${message.event}`,
        );
        break;

      default:
        return Typing.unreachable(message);
    }
  }
}
