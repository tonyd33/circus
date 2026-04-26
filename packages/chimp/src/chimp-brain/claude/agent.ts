/**
 * Claude Agent SDK integration and message processing
 */
import * as ClaudeSDK from "@anthropic-ai/claude-agent-sdk";
import { Protocol } from "@mnke/circus-shared";
import type * as Logger from "@mnke/circus-shared/logger";
import type { PublishFn } from "@/chimp-brain/chimp-brain";

type LogFn = (
  level: Logger.LogLevel,
  message: string,
  data?: Record<string, unknown>,
) => void;

interface ClaudeAgentState {
  sessionId?: string;
  model: string;
  systemPrompt?: string;
  allowedTools: string[];
  workingDir: string;
  mcpUrl: string;
}

/**
 * Create a stub hook handler that logs all hook events
 */
function createHookHandler(
  _log: LogFn,
): (
  input: ClaudeSDK.HookInput,
  toolUseID: string | undefined,
  options: { signal: AbortSignal },
) => Promise<ClaudeSDK.HookJSONOutput> {
  return async (_input, _toolUseID, _options) => {
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
    // TODO: resolve dynamically — hardcoded because SDK platform detection picks musl on glibc images
    pathToClaudeCodeExecutable: "/usr/local/bin/claude",
    model: state.model,
    systemPrompt: state.systemPrompt,
    allowedTools: state.allowedTools,
    continue: sessionId == null,
    resume: sessionId,
    cwd: state.workingDir,
    hooks,
    mcpServers: {
      circus: {
        type: "http",
        url: state.mcpUrl,
      },
    },
  };

  const queryStream = ClaudeSDK.query({
    prompt: userPrompt,
    options,
  });

  for await (const message of queryStream) {
    publish(Protocol.createThought("claude", message));

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
