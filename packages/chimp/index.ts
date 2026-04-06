/**
 * Conduit Chimp - Claude Agent Integration
 *
 * This application connects a Claude AI agent to a NATS JetStream
 * via the Conduit operator, allowing the agent to process messages
 * and respond with AI-generated content using the Claude Agent SDK.
 */

import * as ClaudeSDK from "@anthropic-ai/claude-agent-sdk";
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
import { Client, type Message } from "@mnke/conduit-sdk";
import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import * as path from "path";
import * as os from "os";

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
  client: Client,
): Promise<{ response: string; sessionId: string }> {
  // Publish log message
  await client.publish(
    createLogMessage("info", "Starting agent message processing"),
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

  const pendingPromises: Promise<void>[] = [];

  // Stream the response
  for await (const message of queryStream) {
    pendingPromises.push(
      client.publish(createLogMessage("debug", "Processing...")),
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
  pendingPromises.push(
    client.publish(
      createLogMessage("info", "Agent message processing completed"),
    ),
  );
  await Promise.all(pendingPromises);

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
  client: Client,
): Promise<ChimpOutputMessage | null> {
  console.log(`Handling command: ${command.command}`);

  switch (command.command) {
    case "send-agent-message": {
      const userPrompt = extractPrompt(command);
      console.log("User prompt:", userPrompt);

      // Process with Claude Agent SDK
      const { response, sessionId } = await processWithClaude(
        userPrompt,
        state,
        client,
      );

      console.log("Claude response received");
      console.log("Session ID:", sessionId);

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
      console.log("Will create new session on next agent message");
      await client.publish(
        createLogMessage("info", "Session mode set to new - next message will start new session"),
      );
      return null;

    case "fork-session":
      throw new Error("fork-session command not yet implemented");

    case "stop":
      // Stop command doesn't return a response - it triggers shutdown
      console.log("Stop command received, shutting down...");
      return null;

    case "clone-repo": {
      const { url, branch, path } = command.args;

      await client.publish(
        createLogMessage("info", `Cloning repository: ${url}`),
      );

      // Build git clone command arguments as array (safe from shell injection)
      const targetPath = path || url.split("/").pop()?.replace(".git", "") || "repo";
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

        const actualBranch = (await new Response(getBranchProc.stdout).text()).trim();

        await client.publish(
          createLogMessage("info", `Repository cloned successfully to ${targetPath} (branch: ${actualBranch})`),
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

        await client.publish(
          createLogMessage("info", `Working directory set to: ${absolutePath}`),
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
      await client.publish(
        createLogMessage("info", `Model set to: ${command.args.model}`),
      );
      return null;

    case "set-allowed-tools":
      state.allowedTools = command.args.tools;
      await client.publish(
        createLogMessage("info", `Allowed tools set to: ${command.args.tools.join(", ")}`),
      );
      return null;

    case "save-session": {
      if (!state.sessionId) {
        throw new Error("No active session to save");
      }

      const sessionFile = getSessionFilePath(state.workingDir, state.sessionId);

      await client.publish(
        createLogMessage("info", `Saving session ${state.sessionId} to S3`),
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

        await client.publish(
          createLogMessage("info", `Session saved successfully to ${s3Path}`),
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

      await client.publish(
        createLogMessage("info", `Restoring session ${sessionId}`),
      );

      try {
        // Build S3 key from session ID (format: sessions/<session-id>.jsonl)
        const s3Client = createS3Client();
        const bucket = process.env.S3_BUCKET || "claude-sessions";
        const key = `sessions/${sessionId}.jsonl`;

        await client.publish(
          createLogMessage("info", `Downloading from s3://${bucket}/${key}`),
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

        await client.publish(
          createLogMessage("info", `Session ${sessionId} restored successfully from S3`),
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

async function main() {
  console.log("Starting Conduit Chimp - Claude Agent...");

  // Validate API key
  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error("ANTHROPIC_API_KEY environment variable is required");
  }
  console.log("Claude Agent SDK initialized");

  // Create the Conduit client
  const client = await Client.create();

  // Initialize state
  const state: AppState = {
    messageCount: 0,
    sessionId: undefined,
    model: "claude-haiku-4-5",
    allowedTools: ["Read", "Glob", "Grep", "Write", "Edit"],
    workingDir: process.cwd(),
  };

  // Handle shutdown signals
  let isShuttingDown = false;

  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log("Shutting down...");
    await client.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Define message handler
  const handler = async (msg: Message) => {
    console.log(`Received message (seq=${msg.sequence}, type=${msg.type})`);

    try {
      // Parse and validate command according to protocol
      const command = parseChimpCommand(msg.payload);

      // Handle command and get response
      const response = await handleCommand(command, state, client);

      // Publish response if there is one
      if (response) {
        await client.publish(response);
      }

      // Handle stop command
      if (command.command === "stop") {
        await shutdown();
        return;
      }

      console.log(`Processed message ${msg.sequence} successfully`);
    } catch (error) {
      console.error("Error processing message:", error);

      // Publish error response
      await client.publish(
        createErrorResponse(
          error instanceof Error ? error.message : "Unknown error",
          undefined,
          {
            sequence: msg.sequence.toString(),
            timestamp: new Date().toISOString(),
          },
        ),
      );
    }
  };

  try {
    // Start processing messages
    console.log("Ready to process messages");
    await client.run(handler);
  } catch (error) {
    console.error("Error:", error);
    await client.close();
    process.exit(1);
  }
}

// Run the application
main().catch((error) => {
  console.error("Fatal error:", error);
  process.exit(1);
});
