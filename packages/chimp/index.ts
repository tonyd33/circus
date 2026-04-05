/**
 * Conduit Chimp - Claude Agent Integration
 *
 * This application connects a Claude AI agent to a NATS JetStream
 * via the Conduit operator, allowing the agent to process messages
 * and respond with AI-generated content using the Claude Agent SDK.
 */

import { Client, type Message } from "@mnke/conduit-sdk";
import { query } from "@anthropic-ai/claude-agent-sdk";
import {
  parseChimpMessage,
  isAgentMessage,
  isControlMessage,
  extractPrompt,
  createControlResponse,
  createErrorResponse,
  type ChimpMessage,
  type ControlMessage,
} from "@mnke/circus-protocol";

/**
 * Application state tracking.
 */
interface AppState {
  messageCount: number;
  sessionId?: string;
  currentSessionMode: "continue" | "new" | "resume";
  resumeSessionId?: string;
}

/**
 * Process a message using Claude Agent SDK with session continuity
 */
async function processWithClaude(
  userPrompt: string,
  sessionMode: "continue" | "new" | "resume",
  resumeSessionId?: string,
): Promise<{ response: string; sessionId: string }> {
  console.log("Sending message to Claude Agent...");

  let responseText = "";
  let sessionId = "";

  // Build query options based on session mode
  const options: any = {
    model: "claude-haiku-4-5",
    allowedTools: ["Read", "Glob", "Grep", "Write", "Edit"],
  };

  if (sessionMode === "continue") {
    // Continue the most recent session (or create new if first message)
    options.continue = true;
  } else if (sessionMode === "resume" && resumeSessionId) {
    // Resume a specific session by ID
    options.resume = resumeSessionId;
  }
  // 'new' mode: don't set continue or resume (creates fresh session)

  const queryStream = query({
    prompt: userPrompt,
    options,
  });

  // Stream the response
  for await (const message of queryStream) {
    // Capture session ID from result message
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

  return {
    response: responseText,
    sessionId: sessionId,
  };
}

/**
 * Handle control commands
 */
async function handleControlCommand(
  command: ControlMessage,
  state: AppState,
  client: Client,
): Promise<object> {
  console.log(`Handling control command: ${command.command}`);

  switch (command.command) {
    case "stop":
      // Graceful shutdown will be handled by the shutdown handler
      console.log("Stop command received, shutting down...");
      return createControlResponse("stopped", {
        sessionId: state.sessionId,
      });

    case "new-session":
      state.currentSessionMode = "new";
      state.resumeSessionId = undefined;
      console.log("Will create new session on next agent message");
      return createControlResponse("session-reset", {
        message: "Next agent message will create a new session",
      });

    case "resume-session":
      if (!command.args?.sessionId) {
        throw new Error("resume-session requires sessionId in args");
      }
      state.currentSessionMode = "resume";
      state.resumeSessionId = command.args.sessionId;
      console.log(`Will resume session: ${command.args.sessionId}`);
      return createControlResponse("session-will-resume", {
        sessionId: command.args.sessionId,
      });

    case "get-status":
      return createControlResponse("running", {
        sessionId: state.sessionId,
        messageCount: state.messageCount,
        model: "claude-haiku-4-5",
        sessionMode: state.currentSessionMode,
      });

    case "fork-session":
      // Fork will happen on next agent message by using resume + forkSession
      if (!state.sessionId) {
        throw new Error("Cannot fork: no active session");
      }
      state.currentSessionMode = "resume";
      state.resumeSessionId = state.sessionId;
      // Note: We'll need to add forkSession option in processWithClaude
      return createControlResponse("session-will-fork", {
        message: "Next agent message will fork from current session",
        originalSessionId: state.sessionId,
      });

    default:
      throw new Error(`Unknown control command: ${(command as any).command}`);
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
    currentSessionMode: "continue", // Default to sessionful conversation
    resumeSessionId: undefined,
  };
  client.updateState(state);

  // Handle shutdown signals
  let isShuttingDown = false;

  const shutdown = async () => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    console.log("Shutting down...");
    await client.checkpoint();
    await client.close();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);

  // Define message handler
  const handler = async (msg: Message) => {
    console.log(`Received message (seq=${msg.sequence}, type=${msg.type})`);

    try {
      // Parse and validate message according to protocol
      const chimpMessage = parseChimpMessage(msg.payload);

      // Handle control messages
      if (isControlMessage(chimpMessage)) {
        const response = await handleControlCommand(
          chimpMessage,
          state,
          client,
        );

        // Publish control response
        await client.publish(response);

        // Handle stop command
        if (chimpMessage.command === "stop") {
          await shutdown();
        }

        return;
      }

      // Extract prompt from agent message
      const userPrompt = extractPrompt(chimpMessage);

      console.log("User prompt:", userPrompt);
      console.log("Session mode:", state.currentSessionMode);

      // Process with Claude Agent SDK
      const { response, sessionId } = await processWithClaude(
        userPrompt,
        state.currentSessionMode,
        state.resumeSessionId,
      );

      console.log("Claude response received");
      console.log("Session ID:", sessionId);

      // Update state with session ID for continuity
      state.sessionId = sessionId;
      state.messageCount++;

      // After processing, reset to continue mode (unless it was explicitly set to something else)
      if (
        state.currentSessionMode === "new" ||
        state.currentSessionMode === "resume"
      ) {
        state.currentSessionMode = "continue";
        state.resumeSessionId = undefined;
      }

      client.updateState(state);

      // Publish response (just the text content)
      await client.publish(response);

      // Checkpoint every 5 messages
      if (state.messageCount % 5 === 0) {
        console.log(`Checkpointing at message ${state.messageCount}`);
        await client.checkpoint();
      }

      console.log(`Processed message ${msg.sequence} successfully`);
    } catch (error) {
      console.error("Error processing message:", error);

      // Publish error response
      await client.publish(
        createErrorResponse(
          error instanceof Error ? error.message : "Unknown error",
          {
            sequence: msg.sequence,
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
