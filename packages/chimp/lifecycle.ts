/**
 * Lifecycle management - startup, runtime, and shutdown phases
 */
import { ChimpNaming } from "@mnke/circus-shared/chimp-naming";
import { createLogger } from "@mnke/circus-shared/logger";
import {
  createMetrics,
  type ServiceMetrics,
} from "@mnke/circus-shared/metrics";
import {
  createErrorResponse,
  parseChimpCommand,
} from "@mnke/circus-shared/protocol";
import { connect, type NatsConnection } from "nats";
import { handleCommand } from "./command-handlers";
import { getDefaultState } from "./config";
import {
  createCloseNatsHandler,
  createInitConfigHandler,
  createPublishCompletionHandler,
  createRestoreAgentStateHandler,
  createRestoreSessionHandler,
  createSaveAgentStateHandler,
  createSaveSessionHandler,
  createStopHeartbeatHandler,
} from "./default-hooks";
import { type LifecycleContext, LifecycleHooks } from "./lifecycle-hooks";
import { publishJson } from "./nats-utils";
import type { AppState, CompletionEvent } from "./types";

let logger = createLogger("Chimp");

/**
 * Startup phase - Initialize connections and restore session if available
 */
export async function startup(): Promise<{
  nc: NatsConnection;
  chimpName: string;
  state: AppState;
  metrics: ServiceMetrics;
  hooks: LifecycleHooks;
  heartbeatIntervalRef: { current: Timer | null };
  subjects: {
    inputSubject: string;
    outputSubject: string;
    streamName: string;
    consumerName: string;
  };
}> {
  logger.info("=== STARTUP PHASE ===");

  // Validate API key
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }
  logger.info("Claude Agent SDK initialized");

  // Get chimp name from environment
  const chimpName = process.env.CHIMP_NAME;
  if (!chimpName) {
    throw new Error("CHIMP_NAME environment variable is required");
  }

  // Reinitialize logger with chimp name context
  logger = createLogger("Chimp").child({ chimpName });

  // Initialize metrics
  const metrics = createMetrics({ serviceName: "chimp" });

  // Connect to NATS
  const natsUrl = process.env.NATS_URL || "nats://localhost:4222";
  const nc = await connect({
    servers: natsUrl,
    maxReconnectAttempts: -1,
    reconnectTimeWait: 2000,
  });
  logger.info({ natsUrl }, "Connected to NATS");
  metrics.incActiveConnections("nats");

  // Define subjects using ChimpNaming
  const streamName = ChimpNaming.streamName(chimpName);
  const consumerName = ChimpNaming.consumerName(chimpName);
  const inputSubject = ChimpNaming.inputSubject(chimpName);
  const outputSubject = ChimpNaming.outputSubject(chimpName);

  logger.info({ inputSubject, consumerName }, "Subscribing to input subject");

  // Initialize state
  const state: AppState = getDefaultState();

  // Initialize lifecycle hooks
  const hooks = new LifecycleHooks();

  // Create a reference holder for the heartbeat interval (will be set in runtime)
  const heartbeatIntervalRef: { current: Timer | null } = { current: null };

  // Register startup hooks (executed in order)
  hooks.registerStartup("init-config", createInitConfigHandler(nc));
  hooks.registerStartup(
    "restore-agent-state",
    createRestoreAgentStateHandler(),
  );
  hooks.registerStartup("restore-session", createRestoreSessionHandler());

  // Register shutdown hooks (executed in LIFO - reverse order)
  // Registration order: close-nats → stop-heartbeat → publish-completion → save-agent-state → save-session
  // Execution order: save-session → save-agent-state → publish-completion → stop-heartbeat → close-nats
  hooks.registerShutdown("close-nats", createCloseNatsHandler(nc, metrics));
  hooks.registerShutdown(
    "stop-heartbeat",
    createStopHeartbeatHandler(() => heartbeatIntervalRef.current),
  );
  hooks.registerShutdown(
    "publish-completion",
    createPublishCompletionHandler(nc),
  );
  hooks.registerShutdown("save-agent-state", createSaveAgentStateHandler());
  hooks.registerShutdown("save-session", createSaveSessionHandler());

  // Execute startup hooks
  const context: LifecycleContext = { chimpName, state };
  await hooks.executeStartup(context);

  logger.info("=== STARTUP COMPLETE ===");

  return {
    nc,
    chimpName,
    state,
    metrics,
    hooks,
    heartbeatIntervalRef,
    subjects: {
      inputSubject,
      outputSubject,
      streamName,
      consumerName,
    },
  };
}

/**
 * Shutdown phase - Save session and clean up resources
 */
export async function shutdown(
  chimpName: string,
  state: AppState,
  hooks: LifecycleHooks,
  reason: CompletionEvent["reason"] = "explicit_stop",
): Promise<void> {
  logger.info({ reason }, "=== SHUTDOWN PHASE ===");

  // Execute shutdown hooks
  const context: LifecycleContext = { chimpName, state };
  await hooks.executeShutdown(context, reason);

  logger.info("=== SHUTDOWN COMPLETE ===");
  process.exit(0);
}

/**
 * Runtime phase - Process messages from NATS
 */
export async function runtime(
  nc: NatsConnection,
  chimpName: string,
  state: AppState,
  metrics: ServiceMetrics,
  hooks: LifecycleHooks,
  heartbeatIntervalRef: { current: Timer | null },
  subjects: {
    streamName: string;
    consumerName: string;
    outputSubject: string;
  },
  metricsPort: number = 9092,
): Promise<void> {
  logger.info("=== RUNTIME PHASE ===");

  const { streamName, consumerName, outputSubject } = subjects;

  // Start metrics server
  Bun.serve({
    port: metricsPort,
    fetch: async (req) => {
      const url = new URL(req.url);

      if (url.pathname === "/metrics") {
        const metricsData = await metrics.getMetrics();
        return new Response(metricsData, {
          headers: { "Content-Type": metrics.getContentType() },
        });
      }

      if (url.pathname === "/healthz") {
        return new Response("OK", { status: 200 });
      }

      return new Response("Not Found", { status: 404 });
    },
  });

  logger.info({ port: metricsPort }, "Metrics server started");

  // Setup shutdown handler
  let isShuttingDown = false;
  const doShutdown = async (
    reason: CompletionEvent["reason"] = "explicit_stop",
  ) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    await shutdown(chimpName, state, hooks, reason);
  };

  // Handle shutdown signals
  process.on("SIGINT", () => doShutdown("explicit_stop"));
  process.on("SIGTERM", () => doShutdown("explicit_stop"));

  // Start heartbeat interval (every 10 seconds)
  heartbeatIntervalRef.current = setInterval(async () => {
    try {
      const heartbeatSubject = ChimpNaming.heartbeatSubject(chimpName);
      const heartbeat = {
        chimpName,
        timestamp: Date.now(),
        messageCount: state.messageCount,
      };

      publishJson(nc, heartbeatSubject, heartbeat);
      logger.info({ subject: heartbeatSubject }, "Published heartbeat");
    } catch (error) {
      logger.error({ err: error }, "Failed to publish heartbeat");
    }
  }, 10_000);

  // Get JetStream consumer
  const js = nc.jetstream();
  const consumer = await js.consumers.get(streamName, consumerName);
  logger.info("Connected to JetStream consumer, ready to process messages");

  // Process messages from the consumer
  const messages = await consumer.consume();

  try {
    for await (const msg of messages) {
      const startTime = Date.now();
      logger.info({ subject: msg.subject, seq: msg.seq }, "Received message");
      metrics.recordNatsReceived(msg.subject);

      try {
        // Parse the message payload
        const payload = JSON.parse(msg.string());
        const command = parseChimpCommand(payload);

        // Handle command and get response
        const response = await handleCommand(command, state, nc, chimpName);

        // Publish response if there is one
        if (response) {
          publishJson(nc, outputSubject, response);
          metrics.recordNatsPublish(outputSubject);
        }

        // Acknowledge the message
        msg.ack();

        const duration = (Date.now() - startTime) / 1000;
        metrics.recordNatsProcessed(msg.subject, true, duration);

        // Handle stop command
        if (command.command === "stop") {
          await doShutdown("explicit_stop");
          return;
        }

        logger.info({ seq: msg.seq }, "Processed message successfully");
      } catch (error) {
        logger.error({ err: error }, "Error processing message");
        metrics.recordError("message_processing", "error");

        // Publish error response
        publishJson(
          nc,
          outputSubject,
          createErrorResponse(
            error instanceof Error ? error.message : "Unknown error",
            undefined,
            {
              sequence: msg.seq.toString(),
              timestamp: new Date().toISOString(),
            },
          ),
        );

        // Acknowledge the message even on error to prevent redelivery
        msg.ack();

        const duration = (Date.now() - startTime) / 1000;
        metrics.recordNatsProcessed(msg.subject, false, duration);
      }
    }
  } catch (error) {
    logger.error({ err: error }, "Error in message processing loop");
    await doShutdown("error");
    process.exit(1);
  }
}
