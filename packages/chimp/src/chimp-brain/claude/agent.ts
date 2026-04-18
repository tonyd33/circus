/**
 * Claude Agent SDK integration and message processing
 */
import * as ClaudeSDK from "@anthropic-ai/claude-agent-sdk";
import { type Logger, Protocol } from "@mnke/circus-shared";
import type { PublishFn } from "@/chimp-brain";

type LogFn = (
  level: Logger.LogLevel,
  message: string,
  data?: Record<string, unknown>,
) => void;

interface ClaudeAgentState {
  messageCount: number;
  sessionId?: string;
  model: string;
  allowedTools: string[];
  workingDir: string;
}

/**
 * Create a stub hook handler that logs all hook events
 */
function createHookHandler(
  log: LogFn,
): (
  input: ClaudeSDK.HookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal },
) => Promise<ClaudeSDK.HookJSONOutput> {
  return async (input, toolUseID, _options) => {
    log("debug", `Hook triggered: ${input.hook_event_name}`, {
      hookEvent: input.hook_event_name,
      sessionId: input.session_id,
      toolUseID,
      agentId: input.agent_id,
      agentType: input.agent_type,
    });

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
  state: ClaudeAgentState,
  publish: PublishFn,
  log: LogFn,
): Promise<{ response: string; sessionId: string }> {
  log("info", "Starting agent message processing");

  let responseText = "";
  let sessionId = state.sessionId;

  const hookHandler = createHookHandler(log);
  const hookEvents = ClaudeSDK.HOOK_EVENTS;

  const hooks: Partial<
    Record<ClaudeSDK.HookEvent, ClaudeSDK.HookCallbackMatcher[]>
  > = {};

  for (const event of hookEvents) {
    hooks[event] = [{ hooks: [hookHandler] }];
  }

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

  for await (const message of queryStream) {
    if (message.type === "result") {
      sessionId = message.session_id;
    }

    if (message.type === "assistant") {
      for (const block of message.message.content) {
        if (block.type === "text") {
          responseText += block.text;
          if (sessionId != null) {
            publish(Protocol.createAgentMessageResponse(block.text, sessionId));
          }
        }
      }
    }
  }

  if (!sessionId) {
    throw new Error("No session ID available after processing message");
  }

  log("info", "Agent message processing completed");

  return {
    response: responseText,
    sessionId,
  };
}
