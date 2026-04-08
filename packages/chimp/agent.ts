/**
 * Claude Agent SDK integration and message processing
 */
import * as ClaudeSDK from "@anthropic-ai/claude-agent-sdk";
import { ChimpNaming } from "@mnke/circus-shared/chimp-naming";
import { createLogger } from "@mnke/circus-shared/logger";
import {
  createAgentMessageResponse,
  createLogMessage,
} from "@mnke/circus-shared/protocol";
import type { NatsConnection } from "nats";
import { publishJson } from "./nats-utils";
import type { AppState, CorrelationEvent } from "./types";

const logger = createLogger("Chimp");

/**
 * Publish a correlation event to NATS
 */
export async function publishCorrelation(
  nc: NatsConnection,
  chimpName: string,
  event: CorrelationEvent,
): Promise<void> {
  const correlationSubject = ChimpNaming.correlationSubject(chimpName);
  const payload = {
    ...event,
    sessionName: chimpName,
    timestamp: Date.now(),
  };

  publishJson(nc, correlationSubject, payload);
  logger.info(
    { eventType: event.type, subject: correlationSubject },
    "Published correlation event",
  );
}

/**
 * Create a stub hook handler that logs all hook events to the chimp output
 */
export function createHookHandler(
  nc: NatsConnection,
  chimpName: string,
): (
  input: ClaudeSDK.HookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal },
) => Promise<ClaudeSDK.HookJSONOutput> {
  const outputSubject = ChimpNaming.outputSubject(chimpName);

  return async (input, toolUseID, _options) => {
    // Extract hook event name and relevant data
    const hookEventName = input.hook_event_name;
    const sessionId = input.session_id;

    // Create a debug message with hook details
    const debugMessage = {
      type: "hook-debug",
      hookEvent: hookEventName,
      sessionId,
      toolUseID,
      timestamp: new Date().toISOString(),
      data: input,
    };

    // Log hook event
    logger.debug(
      {
        hookEvent: hookEventName,
        toolUseID,
        agentId: input.agent_id,
        agentType: input.agent_type,
      },
      `Hook triggered: ${hookEventName}`,
    );

    // Return a basic continue response for all hooks
    return {
      async: true,
    };
  };
}

/**
 * Process a message using Claude Agent SDK with session continuity
 * Publishes progress messages and logs during processing
 */
export async function processWithClaude(
  userPrompt: string,
  state: AppState,
  nc: NatsConnection,
  chimpName: string,
): Promise<{ response: string; sessionId: string }> {
  // Publish log message
  const outputSubject = ChimpNaming.outputSubject(chimpName);
  publishJson(
    nc,
    outputSubject,
    createLogMessage("info", "Starting agent message processing"),
  );

  let responseText = "";
  let sessionId = state.sessionId;

  // Create hook handler
  const hookHandler = createHookHandler(nc, chimpName);

  // Define all hook events to handle
  const hookEvents = ClaudeSDK.HOOK_EVENTS;

  // Build hooks configuration for all events
  const hooks: Partial<
    Record<ClaudeSDK.HookEvent, ClaudeSDK.HookCallbackMatcher[]>
  > = {};

  for (const event of hookEvents) {
    hooks[event] = [{ hooks: [hookHandler] }];
  }

  // Build query options based on session mode
  const options: ClaudeSDK.Options = {
    model: state.model,
    allowedTools: state.allowedTools,
    continue: sessionId == null,
    resume: sessionId,
    cwd: state.workingDir,
    hooks,
  };

  const queryStream = ClaudeSDK.query({
    prompt: userPrompt,
    options,
  });

  // Stream the response
  for await (const message of queryStream) {
    if (message.type === "result") {
      sessionId = message.session_id;
    }

    // Collect assistant messages
    if (message.type === "assistant") {
      // Extract text content from the message
      for (const block of message.message.content) {
        if (block.type === "text") {
          responseText += block.text;
          if (sessionId != null) {
            publishJson(
              nc,
              outputSubject,
              createAgentMessageResponse(block.text, sessionId),
            );
          }
        }
      }
    }
  }

  if (!sessionId) {
    throw new Error("No session ID available after processing message");
  }

  // Publish completion log
  publishJson(
    nc,
    outputSubject,
    createLogMessage("info", "Agent message processing completed"),
  );

  return {
    response: responseText,
    sessionId,
  };
}
