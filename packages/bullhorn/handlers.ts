/**
 * Output Handlers for Bullhorn
 *
 * Handlers process chimp output messages and send them to their destinations
 * (e.g., Slack, GitHub, Discord, console logging)
 */

import type { Logger } from "@mnke/circus-shared";
import type { ChimpOutputMessage } from "@mnke/circus-shared/protocol";

/**
 * Interface for handling chimp output messages
 */
export interface OutputHandler {
  /**
   * Handle an output message from a chimp
   * @param chimpName - Name of the chimp that sent the message
   * @param message - The output message
   */
  handle(chimpName: string, message: ChimpOutputMessage): Promise<void>;

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

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async handle(chimpName: string, message: ChimpOutputMessage): Promise<void> {
    // Log based on message type
    switch (message.type) {
      case "agent-message-response":
        this.logger.info(
          { chimpName, sessionId: message.sessionId },
          `[${chimpName}] Agent response: ${message.content}`,
        );
        break;

      case "status-response":
        this.logger.info(
          { chimpName, ...message },
          `[${chimpName}] Status: ${message.messageCount} messages, model: ${message.model}`,
        );
        break;

      case "save-session-response":
        this.logger.info(
          { chimpName, sessionId: message.sessionId, s3Path: message.s3Path },
          `[${chimpName}] Session saved: ${message.sessionId}`,
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
        // Map chimp log levels to our logger
        const logLevel = message.level;
        this.logger[logLevel](
          { chimpName, timestamp: message.timestamp },
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

      default: {
        // Exhaustive check - TypeScript will error if we miss a case
        const _exhaustive: never = message;
        this.logger.warn(
          { chimpName, message: _exhaustive },
          `[${chimpName}] Unknown message type`,
        );
      }
    }
  }
}
