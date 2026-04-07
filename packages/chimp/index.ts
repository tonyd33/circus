/**
 * Conduit Chimp - Claude Agent Integration
 *
 * This application connects a Claude AI agent to a NATS JetStream
 * via the Conduit operator, allowing the agent to process messages
 * and respond with AI-generated content using the Claude Agent SDK.
 */

import * as ClaudeSDK from "@anthropic-ai/claude-agent-sdk";
import { createLogger } from "@mnke/circus-shared/logger";

const logger = createLogger("Chimp");
import {
  type ChimpCommand,
  type ChimpOutputMessage,
  createAgentMessageResponse,
  createErrorResponse,
  createLogMessage,
  createSaveSessionResponse,
  createStatusResponse,
  extractPrompt,
  parseChimpCommand,
} from "@mnke/circus-protocol";
import { connect, type NatsConnection } from "nats";
import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
} from "@aws-sdk/client-s3";
import * as path from "node:path";
import * as os from "node:os";

/**
 * Application state tracking.
 */
interface AppState {
  messageCount: number;
  sessionId?: string;
  model: string;
  allowedTools: string[];
  workingDir: string;
}

/**
 * Correlation event types
 */
type CorrelationEvent =
  | { type: "github-pr"; repo: string; prNumber: number }
  | { type: "github-issue"; repo: string; issueNumber: number }
  | { type: "jira-issue"; issueKey: string }
  | { type: "slack-thread"; channelId: string; threadTs: string }
  | { type: "discord-thread"; channelId: string; threadId: string };

/**
 * Publish a correlation event to NATS
 */
async function _publishCorrelation(
  nc: NatsConnection,
  chimpName: string,
  event: CorrelationEvent,
): Promise<void> {
  const correlationSubject = `chimp.${chimpName}.correlation`;
  const payload = {
    ...event,
    sessionName: chimpName,
    timestamp: Date.now(),
  };

  nc.publish(correlationSubject, JSON.stringify(payload));
  logger.info(
    { eventType: event.type, subject: correlationSubject },
    "Published correlation event",
  );
}

/**
 * Initialize S3 client from environment variables
 */
function createS3Client(): S3Client {
  const endpoint = process.env.S3_ENDPOINT || "http://minio:9000";
  const region = process.env.S3_REGION || "us-east-1";
  const accessKeyId = process.env.S3_ACCESS_KEY_ID || "minioadmin";
  const secretAccessKey = process.env.S3_SECRET_ACCESS_KEY || "minioadmin";

  return new S3Client({
    endpoint,
    region,
    credentials: {
      accessKeyId,
      secretAccessKey,
    },
    forcePathStyle: true, // Required for MinIO
  });
}

/**
 * Get the session file path for a given working directory and session ID
 * Format: ~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
 * where <encoded-cwd> is the absolute working directory with every
 * non-alphanumeric character replaced by -
 */
function getSessionFilePath(workingDir: string, sessionId: string): string {
  const homeDir = os.homedir();
  const claudeDir = path.join(homeDir, ".claude", "projects");

  // Encode the working directory path by replacing non-alphanumeric chars with -
  // e.g., /Users/me/proj becomes -Users-me-proj
  const encodedCwd = workingDir.replace(/[^a-zA-Z0-9]/g, "-");

  const sessionFile = path.join(claudeDir, encodedCwd, `${sessionId}.jsonl`);
  return sessionFile;
}

/**
 * Process a message using Claude Agent SDK with session continuity
 * Publishes progress messages and logs during processing
 */
async function processWithClaude(
  userPrompt: string,
  state: AppState,
  nc: NatsConnection,
  chimpName: string,
): Promise<{ response: string; sessionId: string }> {
  // Publish log message
  const outputSubject = `chimp.${chimpName}.output`;
  nc.publish(
    outputSubject,
    JSON.stringify(
      createLogMessage("info", "Starting agent message processing"),
    ),
  );

  let responseText = "";
  let sessionId = state.sessionId;

  // Build query options based on session mode
  const options: ClaudeSDK.Options = {
    model: state.model,
    allowedTools: state.allowedTools,
    continue: sessionId == null,
    resume: sessionId,
    cwd: state.workingDir,
  };

  const queryStream = ClaudeSDK.query({
    prompt: userPrompt,
    options,
  });

  const _pendingPromises: Promise<void>[] = [];

  // Stream the response
  for await (const message of queryStream) {
    nc.publish(
      outputSubject,
      JSON.stringify(createLogMessage("debug", "Processing...")),
    );
    if (message.type === "result") {
      sessionId = message.session_id;
    }

    // Collect assistant messages
    if (message.type === "assistant") {
      // Extract text content from the message
      for (const block of message.message.content) {
        if (block.type === "text") {
          responseText += block.text;
        }
      }
    }
  }

  if (!sessionId) {
    throw new Error("No session ID available after processing message");
  }

  // Publish completion log
  nc.publish(
    outputSubject,
    JSON.stringify(
      createLogMessage("info", "Agent message processing completed"),
    ),
  );

  return {
    response: responseText,
    sessionId,
  };
}

/**
 * Handle commands and return appropriate response
 */
async function handleCommand(
  command: ChimpCommand,
  state: AppState,
  nc: NatsConnection,
  chimpName: string,
): Promise<ChimpOutputMessage | null> {
  logger.info({ command: command.command }, "Handling command");

  const outputSubject = `chimp.${chimpName}.output`;

  switch (command.command) {
    case "send-agent-message": {
      const userPrompt = extractPrompt(command);
      logger.info({ userPrompt }, "User prompt");

      // Process with Claude Agent SDK
      const { response, sessionId } = await processWithClaude(
        userPrompt,
        state,
        nc,
        chimpName,
      );

      logger.info("Claude response received");
      logger.info({ sessionId }, "Session ID");

      // Update state
      state.sessionId = sessionId;
      state.messageCount++;

      return createAgentMessageResponse(response, sessionId);
    }

    case "get-status":
      return createStatusResponse({
        sessionId: state.sessionId,
        messageCount: state.messageCount,
        model: state.model,
      });

    case "new-session":
      state.sessionId = undefined;
      logger.info("Will create new session on next agent message");
      nc.publish(
        outputSubject,
        JSON.stringify(
          createLogMessage(
            "info",
            "Session mode set to new - next message will start new session",
          ),
        ),
      );
      return null;

    case "fork-session":
      throw new Error("fork-session command not yet implemented");

    case "stop":
      // Stop command doesn't return a response - it triggers shutdown
      logger.info("Stop command received, shutting down...");
      return null;

    case "clone-repo": {
      const { url, branch, path } = command.args;

      nc.publish(
        outputSubject,
        JSON.stringify(createLogMessage("info", `Cloning repository: ${url}`)),
      );

      // Build git clone command arguments as array (safe from shell injection)
      const targetPath =
        path || url.split("/").pop()?.replace(".git", "") || "repo";
      const gitArgs = ["clone"];

      if (branch) {
        gitArgs.push("--branch", branch);
      }

      gitArgs.push(url, targetPath);

      try {
        const proc = Bun.spawn(["git", ...gitArgs], {
          stdout: "pipe",
          stderr: "pipe",
        });

        const exitCode = await proc.exited;

        if (exitCode !== 0) {
          const stderr = await new Response(proc.stderr).text();
          throw new Error(`Git clone failed: ${stderr}`);
        }

        // Get the actual branch name (might be default branch if not specified)
        const getBranchProc = Bun.spawn(
          ["git", "rev-parse", "--abbrev-ref", "HEAD"],
          {
            cwd: targetPath,
            stdout: "pipe",
          },
        );

        const actualBranch = (
          await new Response(getBranchProc.stdout).text()
        ).trim();

        nc.publish(
          outputSubject,
          JSON.stringify(
            createLogMessage(
              "info",
              `Repository cloned successfully to ${targetPath} (branch: ${actualBranch})`,
            ),
          ),
        );

        return null;
      } catch (error) {
        throw new Error(
          `Failed to clone repository: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    case "set-working-dir": {
      const { path: inputPath } = command.args;

      try {
        // Normalize to absolute path
        const absolutePath = path.isAbsolute(inputPath)
          ? inputPath
          : path.resolve(state.workingDir, inputPath);

        // Update state with new working directory
        state.workingDir = absolutePath;

        nc.publish(
          outputSubject,
          JSON.stringify(
            createLogMessage(
              "info",
              `Working directory set to: ${absolutePath}`,
            ),
          ),
        );

        return null;
      } catch (error) {
        throw new Error(
          `Failed to set working directory: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    case "set-model":
      state.model = command.args.model;
      nc.publish(
        outputSubject,
        JSON.stringify(
          createLogMessage("info", `Model set to: ${command.args.model}`),
        ),
      );
      return null;

    case "set-allowed-tools":
      state.allowedTools = command.args.tools;
      nc.publish(
        outputSubject,
        JSON.stringify(
          createLogMessage(
            "info",
            `Allowed tools set to: ${command.args.tools.join(", ")}`,
          ),
        ),
      );
      return null;

    case "save-session": {
      if (!state.sessionId) {
        throw new Error("No active session to save");
      }

      const sessionFile = getSessionFilePath(state.workingDir, state.sessionId);

      nc.publish(
        outputSubject,
        JSON.stringify(
          createLogMessage("info", `Saving session ${state.sessionId} to S3`),
        ),
      );

      try {
        // Read the session file
        const fileContent = await Bun.file(sessionFile).arrayBuffer();

        // Upload to S3
        const s3Client = createS3Client();
        const bucket = process.env.S3_BUCKET || "claude-sessions";
        const s3Key = `sessions/${state.sessionId}.jsonl`;

        await s3Client.send(
          new PutObjectCommand({
            Bucket: bucket,
            Key: s3Key,
            Body: new Uint8Array(fileContent),
            ContentType: "application/jsonl",
          }),
        );

        const s3Path = `s3://${bucket}/${s3Key}`;

        nc.publish(
          outputSubject,
          JSON.stringify(
            createLogMessage("info", `Session saved successfully to ${s3Path}`),
          ),
        );

        return createSaveSessionResponse(s3Path, state.sessionId);
      } catch (error) {
        throw new Error(
          `Failed to save session: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    case "restore-session": {
      const { sessionId } = command.args;

      nc.publish(
        outputSubject,
        JSON.stringify(
          createLogMessage("info", `Restoring session ${sessionId}`),
        ),
      );

      try {
        // Build S3 key from session ID (format: sessions/<session-id>.jsonl)
        const s3Client = createS3Client();
        const bucket = process.env.S3_BUCKET || "claude-sessions";
        const key = `sessions/${sessionId}.jsonl`;

        nc.publish(
          outputSubject,
          JSON.stringify(
            createLogMessage("info", `Downloading from s3://${bucket}/${key}`),
          ),
        );

        // Download from S3
        const response = await s3Client.send(
          new GetObjectCommand({
            Bucket: bucket,
            Key: key,
          }),
        );

        if (!response.Body) {
          throw new Error("Empty response from S3");
        }

        // Read the body stream
        const chunks: Uint8Array[] = [];
        for await (const chunk of response.Body as AsyncIterable<Uint8Array>) {
          chunks.push(chunk);
        }
        const fileContent = Buffer.concat(chunks);

        // Write to local session file
        const sessionFile = getSessionFilePath(state.workingDir, sessionId);
        const sessionDir = path.dirname(sessionFile);

        // Ensure directory exists
        await Bun.$`mkdir -p ${sessionDir}`;

        // Write the session file
        await Bun.write(sessionFile, fileContent);

        // Update state to resume this session
        state.sessionId = sessionId;

        nc.publish(
          outputSubject,
          JSON.stringify(
            createLogMessage(
              "info",
              `Session ${sessionId} restored successfully from S3`,
            ),
          ),
        );

        return null;
      } catch (error) {
        throw new Error(
          `Failed to restore session: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    default: {
      // TypeScript will error if we miss a case
      const _exhaustive: never = command;
      throw new Error(`Unknown command: ${(command as any).command}`);
    }
  }
}

/**
 * Completion event types
 */
interface CompletionEvent {
  type: "completion";
  chimpName: string;
  timestamp: number;
  reason: "idle_timeout" | "explicit_stop" | "error";
  messageCount: number;
  sessionId?: string;
}

/**
 * Publish a completion event to NATS
 */
async function publishCompletion(
  nc: NatsConnection,
  chimpName: string,
  reason: CompletionEvent["reason"],
  state: AppState,
): Promise<void> {
  const controlSubject = `chimp.${chimpName}.control`;
  const event: CompletionEvent = {
    type: "completion",
    chimpName,
    timestamp: Date.now(),
    reason,
    messageCount: state.messageCount,
    sessionId: state.sessionId,
  };

  nc.publish(controlSubject, JSON.stringify(event));
  logger.info(
    { reason, subject: controlSubject },
    "Published completion event",
  );
}

async function main() {
  logger.info("Starting Chimp - Claude Agent...");

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

  // Get idle timeout from environment (default: 30 minutes)
  const idleTimeoutMs = parseInt(process.env.IDLE_TIMEOUT_MS || "1800000", 10);

  // Connect to NATS
  const natsUrl = process.env.NATS_URL || "nats://localhost:4222";
  const nc = await connect({
    servers: natsUrl,
    maxReconnectAttempts: -1,
    reconnectTimeWait: 2000,
  });
  logger.info({ natsUrl }, "Connected to NATS");

  // Get JetStream context
  const js = nc.jetstream();
  const streamName = `chimp-${chimpName}`;
  const consumerName = `chimp-${chimpName}-consumer`;
  const inputSubject = `chimp.${chimpName}.input`;
  const outputSubject = `chimp.${chimpName}.output`;

  logger.info({ inputSubject, consumerName }, "Subscribing to input subject");

  // Initialize state
  const state: AppState = {
    messageCount: 0,
    sessionId: undefined,
    model: process.env.CLAUDE_MODEL || "claude-sonnet-4-5",
    allowedTools: process.env.ALLOWED_TOOLS
      ? process.env.ALLOWED_TOOLS.split(",").map((t) => t.trim())
      : ["Read", "Glob", "Grep", "Write", "Edit", "Bash"],
    workingDir: process.env.WORKING_DIR || process.cwd(),
  };

  // Handle shutdown signals
  let isShuttingDown = false;
  let heartbeatInterval: Timer | null = null;
  let idleTimeout: Timer | null = null;

  const shutdown = async (
    reason: CompletionEvent["reason"] = "explicit_stop",
  ) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info({ reason }, "Shutting down");

    // Publish completion event
    await publishCompletion(nc, chimpName, reason, state);

    // Stop timers
    if (heartbeatInterval) {
      clearInterval(heartbeatInterval);
    }
    if (idleTimeout) {
      clearTimeout(idleTimeout);
    }

    await nc.close();
    process.exit(0);
  };

  const resetIdleTimeout = () => {
    if (idleTimeout) {
      clearTimeout(idleTimeout);
    }
    idleTimeout = setTimeout(async () => {
      logger.info({ idleTimeoutMs }, "No activity, shutting down");
      await shutdown("idle_timeout");
    }, idleTimeoutMs);
  };

  // Start idle timeout
  resetIdleTimeout();

  process.on("SIGINT", () => shutdown("explicit_stop"));
  process.on("SIGTERM", () => shutdown("explicit_stop"));

  // Start heartbeat interval (every 10 seconds)
  heartbeatInterval = setInterval(async () => {
    try {
      const heartbeatSubject = `chimp.${chimpName}.heartbeat`;
      const heartbeat = {
        chimpName,
        timestamp: Date.now(),
        messageCount: state.messageCount,
      };

      nc.publish(heartbeatSubject, JSON.stringify(heartbeat));
      logger.info({ subject: heartbeatSubject }, "Published heartbeat");
    } catch (error) {
      logger.error({ err: error }, "Failed to publish heartbeat");
    }
  }, 10_000);

  // Get durable consumer
  const consumer = await js.consumers.get(streamName, consumerName);
  logger.info("Connected to JetStream consumer, ready to process messages");

  // Process messages from the consumer
  const messages = await consumer.consume();

  try {
    for await (const msg of messages) {
      logger.info({ subject: msg.subject, seq: msg.seq }, "Received message");

      // Reset idle timeout on each message
      resetIdleTimeout();

      try {
        // Parse the message payload
        const payload = JSON.parse(msg.string());
        const command = parseChimpCommand(payload);

        // Handle command and get response
        const response = await handleCommand(command, state, nc, chimpName);

        // Publish response if there is one
        if (response) {
          nc.publish(outputSubject, JSON.stringify(response));
        }

        // Acknowledge the message
        msg.ack();

        // Handle stop command
        if (command.command === "stop") {
          await shutdown("explicit_stop");
          return;
        }

        logger.info({ seq: msg.seq }, "Processed message successfully");
      } catch (error) {
        logger.error({ err: error }, "Error processing message");

        // Publish error response
        nc.publish(
          outputSubject,
          JSON.stringify(
            createErrorResponse(
              error instanceof Error ? error.message : "Unknown error",
              undefined,
              {
                sequence: msg.seq.toString(),
                timestamp: new Date().toISOString(),
              },
            ),
          ),
        );

        // Acknowledge the message even on error to prevent redelivery
        msg.ack();
      }
    }
  } catch (error) {
    logger.error({ err: error }, "Error in message processing loop");
    await shutdown("error");
    process.exit(1);
  }
}

// Run the application
main().catch((error) => {
  logger.error({ err: error }, "Fatal error");
  process.exit(1);
});
