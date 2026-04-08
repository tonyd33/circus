/**
 * Default lifecycle hooks for Chimp application
 */
import { ChimpNaming } from "@mnke/circus-shared/chimp-naming";
import { createLogger } from "@mnke/circus-shared/logger";
import type { ServiceMetrics } from "@mnke/circus-shared/metrics";
import { parseChimpCommand } from "@mnke/circus-shared/protocol";
import type { NatsConnection } from "nats";
import { handleCommand } from "./command-handlers";
import { loadInitConfig } from "./config";
import type {
  LifecycleContext,
  ShutdownHook,
  StartupHook,
} from "./lifecycle-hooks";
import { publishJson } from "./nats-utils";
import {
  restoreAppStateFromS3,
  restoreClaudeStateFromS3,
  saveAppStateToS3,
  saveClaudeStateToS3,
} from "./session-storage";
import type { CompletionEvent } from "./types";

const logger = createLogger("Chimp");

/**
 * Startup hook: Load and execute initialization configuration
 */
export function createInitConfigHandler(nc: NatsConnection): StartupHook {
  return async (context: LifecycleContext) => {
    const { chimpName, state } = context;
    const initConfig = await loadInitConfig();

    if (!initConfig) {
      return;
    }

    logger.info(
      { commandCount: initConfig.commands.length },
      "Executing initialization commands",
    );

    for (let i = 0; i < initConfig.commands.length; i++) {
      const command = initConfig.commands[i];
      if (!command) {
        logger.warn({ commandIndex: i }, "Skipping undefined command");
        continue;
      }

      logger.info(
        { commandIndex: i, command: command.command },
        `Executing init command ${i + 1}/${initConfig.commands.length}`,
      );

      try {
        // Parse and validate the command
        const validatedCommand = parseChimpCommand(command);

        // Execute the command
        const response = await handleCommand(
          validatedCommand,
          state,
          nc,
          chimpName,
        );

        // Log response if there is one
        if (response) {
          logger.info({ response }, "Init command completed with response");
        } else {
          logger.info("Init command completed");
        }
      } catch (error) {
        logger.error(
          { err: error, command: command.command },
          "Failed to execute init command",
        );
        // Continue with next command even if this one fails
      }
    }

    logger.info("Initialization commands completed");
  };
}

/**
 * Startup hook: Restore agent state (AppState) from S3
 */
export function createRestoreAgentStateHandler(): StartupHook {
  return async (context: LifecycleContext) => {
    const { chimpName, state } = context;
    try {
      logger.info(
        { chimpName },
        "Restoring agent state (AppState) from S3 on startup",
      );
      const restoredState = await restoreAppStateFromS3(chimpName);

      if (restoredState) {
        // Merge restored state into current state
        Object.assign(state, restoredState);
        logger.info(
          { chimpName, state: restoredState },
          "Agent state restored successfully from S3",
        );
      } else {
        logger.info(
          { chimpName },
          "No previous agent state found, starting fresh",
        );
      }
    } catch (error) {
      logger.warn(
        { err: error, chimpName },
        "Failed to restore agent state from S3, will start fresh",
      );
    }
  };
}

/**
 * Startup hook: Restore Claude session state from S3
 */
export function createRestoreSessionHandler(): StartupHook {
  return async (context: LifecycleContext) => {
    const { chimpName } = context;
    try {
      logger.info(
        { chimpName },
        "Restoring Claude session state from S3 on startup",
      );
      await restoreClaudeStateFromS3(chimpName);
      logger.info(
        { chimpName },
        "Claude session state restored successfully from S3",
      );
    } catch (error) {
      logger.warn(
        { err: error, chimpName },
        "Failed to restore Claude session state from S3, will start fresh",
      );
    }
  };
}

/**
 * Shutdown hook: Close NATS connection
 */
export function createCloseNatsHandler(
  nc: NatsConnection,
  metrics: ServiceMetrics,
): ShutdownHook {
  return async () => {
    await nc.close();
    metrics.decActiveConnections("nats");
    logger.info("NATS connection closed");
  };
}

/**
 * Shutdown hook: Stop heartbeat timer
 * Accepts a getter function to retrieve the interval at shutdown time
 */
export function createStopHeartbeatHandler(
  getHeartbeatInterval: () => Timer | null,
): ShutdownHook {
  return async () => {
    const heartbeatInterval = getHeartbeatInterval();
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
      logger.debug("Heartbeat timer stopped");
    }
  };
}

/**
 * Shutdown hook: Publish completion event
 */
export function createPublishCompletionHandler(
  nc: NatsConnection,
): ShutdownHook {
  return async (context: LifecycleContext, reason) => {
    const { chimpName, state } = context;
    const controlSubject = ChimpNaming.controlSubject(chimpName);

    const event: CompletionEvent = {
      type: "completion",
      chimpName,
      timestamp: Date.now(),
      reason,
      messageCount: state.messageCount,
      sessionId: state.sessionId,
    };

    publishJson(nc, controlSubject, event);
    logger.info(
      { reason, subject: controlSubject },
      "Published completion event",
    );
  };
}

/**
 * Shutdown hook: Save agent state (AppState) to S3
 */
export function createSaveAgentStateHandler(): ShutdownHook {
  return async (context: LifecycleContext) => {
    const { chimpName, state } = context;

    try {
      logger.info(
        { chimpName, state },
        "Saving agent state (AppState) to S3 on shutdown",
      );
      const s3Path = await saveAppStateToS3(chimpName, state);
      logger.info({ s3Path }, "Agent state saved to S3 successfully");
    } catch (error) {
      logger.error(
        { err: error },
        "Failed to save agent state to S3 on shutdown",
      );
    }
  };
}

/**
 * Shutdown hook: Save Claude session state to S3
 */
export function createSaveSessionHandler(): ShutdownHook {
  return async (context: LifecycleContext) => {
    const { chimpName, state } = context;

    if (state.sessionId) {
      try {
        logger.info(
          { chimpName },
          "Saving Claude session state to S3 on shutdown",
        );
        const s3Path = await saveClaudeStateToS3(chimpName);
        logger.info(
          { s3Path },
          "Claude session state saved to S3 successfully",
        );
      } catch (error) {
        logger.error(
          { err: error },
          "Failed to save Claude session state to S3 on shutdown",
        );
      }
    }
  };
}
