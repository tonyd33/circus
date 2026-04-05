/**
 * Chimp Protocol - Message validation and types
 *
 * Defines the protocol for communicating with Chimp agents via Conduit exchanges.
 * Provides Zod schemas for validation and TypeScript types for type safety.
 */

import { z } from "zod";

/**
 * Protocol version
 */
export const PROTOCOL_VERSION = "1.0.0";

/**
 * Message command arguments schemas
 */
const SendAgentMessageArgsSchema = z.object({
  prompt: z.string(),
});

const ResumeSessionArgsSchema = z.object({
  sessionId: z.string(),
});

const CloneRepoArgsSchema = z.object({
  url: z.string(),
  branch: z.string().optional(),
  path: z.string().optional(),
});

const SetWorkingDirArgsSchema = z.object({
  path: z.string(),
});

const SetModelArgsSchema = z.object({
  model: z.string(),
});

const SetAllowedToolsArgsSchema = z.object({
  tools: z.array(z.string()),
});

const MessageArgsSchema = z.union([
  SendAgentMessageArgsSchema,
  ResumeSessionArgsSchema,
  CloneRepoArgsSchema,
  SetWorkingDirArgsSchema,
  SetModelArgsSchema,
  SetAllowedToolsArgsSchema,
  z.object({}).optional(),
]);

/**
 * Message schema
 * All messages are now control-style messages with a command
 */
export const ChimpMessageSchema = z.object({
  command: z.enum([
    "send-agent-message",
    "stop",
    "new-session",
    "resume-session",
    "get-status",
    "fork-session",
    "clone-repo",
    "set-working-dir",
    "set-model",
    "set-allowed-tools",
  ]),
  args: MessageArgsSchema.optional(),
});

/**
 * Response schemas
 */
export const AgentResponseSchema = z.string();

export const ControlResponseSchema = z.object({
  status: z.string(),
  sessionId: z.string().optional(),
  message: z.string().optional(),
  messageCount: z.number().optional(),
  model: z.string().optional(),
  sessionMode: z.enum(["continue", "new", "resume"]).optional(),
  originalSessionId: z.string().optional(),
  forkedSessionId: z.string().optional(),
});

export const ErrorResponseSchema = z.object({
  error: z.string(),
  command: z.string().optional(),
  sequence: z.number().optional(),
  timestamp: z.string().optional(),
});

export const ChimpResponseSchema = z.union([
  AgentResponseSchema,
  ControlResponseSchema,
  ErrorResponseSchema,
]);

/**
 * Initialization configuration schema
 *
 * Configuration file format for chimp initialization.
 * Contains an array of protocol messages to process before runtime.
 */
export const InitConfigSchema = z.object({
  version: z.string(),
  messages: z.array(ChimpMessageSchema),
});

/**
 * TypeScript types derived from schemas
 */
export type ChimpMessage = z.infer<typeof ChimpMessageSchema>;

export type AgentResponse = z.infer<typeof AgentResponseSchema>;
export type ControlResponse = z.infer<typeof ControlResponseSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type ChimpResponse = z.infer<typeof ChimpResponseSchema>;

export type InitConfig = z.infer<typeof InitConfigSchema>;

/**
 * Validation functions
 */

/**
 * Parse and validate an incoming message
 * @throws ZodError if validation fails
 */
export function parseChimpMessage(payload: unknown): ChimpMessage {
  return ChimpMessageSchema.parse(payload);
}

/**
 * Safely parse an incoming message
 * Returns success: true with data, or success: false with error
 */
export function safeParseChimpMessage(payload: unknown) {
  return ChimpMessageSchema.safeParse(payload);
}

/**
 * Parse and validate an initialization configuration
 * @throws ZodError if validation fails
 */
export function parseInitConfig(config: unknown): InitConfig {
  return InitConfigSchema.parse(config);
}

/**
 * Safely parse an initialization configuration
 * Returns success: true with data, or success: false with error
 */
export function safeParseInitConfig(config: unknown) {
  return InitConfigSchema.safeParse(config);
}

/**
 * Type guards
 */

export function isAgentMessage(msg: ChimpMessage): boolean {
  return msg.command === "send-agent-message";
}

export function isErrorResponse(
  response: ChimpResponse,
): response is ErrorResponse {
  return typeof response === "object" && "error" in response;
}

export function isControlResponse(
  response: ChimpResponse,
): response is ControlResponse {
  return typeof response === "object" && "status" in response;
}

/**
 * Helper functions
 */

/**
 * Extract prompt from an agent message
 */
export function extractPrompt(msg: ChimpMessage): string {
  if (msg.command !== "send-agent-message") {
    throw new Error("Cannot extract prompt from non-agent message");
  }
  if (!msg.args || !("prompt" in msg.args)) {
    throw new Error("Agent message missing prompt in args");
  }
  return msg.args.prompt;
}

/**
 * Create an agent message
 */
export function createAgentMessage(prompt: string): ChimpMessage {
  return {
    command: "send-agent-message",
    args: { prompt },
  };
}

/**
 * Create a message
 */
export function createMessage(
  command: ChimpMessage["command"],
  args?: ChimpMessage["args"],
): ChimpMessage {
  return {
    command,
    args,
  };
}

/**
 * Create a control response
 */
export function createControlResponse(
  status: string,
  data?: Omit<ControlResponse, "status">,
): ControlResponse {
  return {
    status,
    ...data,
  };
}

/**
 * Create an error response
 */
export function createErrorResponse(
  error: string,
  data?: Omit<ErrorResponse, "error">,
): ErrorResponse {
  return {
    error,
    ...data,
  };
}

/**
 * Create an initialization configuration
 */
export function createInitConfig(messages: ChimpMessage[]): InitConfig {
  return {
    version: PROTOCOL_VERSION,
    messages,
  };
}

/**
 * Helper functions for creating specific messages
 */

export function createCloneRepoMessage(
  url: string,
  branch?: string,
  path?: string,
): ChimpMessage {
  return {
    command: "clone-repo",
    args: { url, branch, path },
  };
}

export function createSetWorkingDirMessage(path: string): ChimpMessage {
  return {
    command: "set-working-dir",
    args: { path },
  };
}

export function createSetModelMessage(model: string): ChimpMessage {
  return {
    command: "set-model",
    args: { model },
  };
}

export function createSetAllowedToolsMessage(tools: string[]): ChimpMessage {
  return {
    command: "set-allowed-tools",
    args: { tools },
  };
}
