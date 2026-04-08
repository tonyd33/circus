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
export const PROTOCOL_VERSION = "0.1.0";

// ============================================================================
// INCOMING: Commands sent TO the chimp
// ============================================================================

/**
 * Individual command schemas (discriminated union members)
 */
const SendAgentMessageCommandSchema = z.object({
  command: z.literal("send-agent-message"),
  args: z.object({
    prompt: z.string(),
  }),
});

const StopCommandSchema = z.object({
  command: z.literal("stop"),
});

const NewSessionCommandSchema = z.object({
  command: z.literal("new-session"),
});

const GetStatusCommandSchema = z.object({
  command: z.literal("get-status"),
});

const ForkSessionCommandSchema = z.object({
  command: z.literal("fork-session"),
});

const CloneRepoCommandSchema = z.object({
  command: z.literal("clone-repo"),
  args: z.object({
    url: z.string(),
    branch: z.string().optional(),
    path: z.string().optional(),
  }),
});

const SetWorkingDirCommandSchema = z.object({
  command: z.literal("set-working-dir"),
  args: z.object({
    path: z.string(),
  }),
});

const SetModelCommandSchema = z.object({
  command: z.literal("set-model"),
  args: z.object({
    model: z.string(),
  }),
});

const SetAllowedToolsCommandSchema = z.object({
  command: z.literal("set-allowed-tools"),
  args: z.object({
    tools: z.array(z.string()),
  }),
});

const SaveSessionCommandSchema = z.object({
  command: z.literal("save-session"),
  args: z.object({
    method: z.literal("s3"),
  }),
});

const RestoreSessionCommandSchema = z.object({
  command: z.literal("restore-session"),
  args: z.object({
    sessionId: z.string(),
    method: z.literal("s3"),
  }),
});

/**
 * Command schema - discriminated union of all commands
 */
export const ChimpCommandSchema = z.discriminatedUnion("command", [
  SendAgentMessageCommandSchema,
  StopCommandSchema,
  NewSessionCommandSchema,
  GetStatusCommandSchema,
  ForkSessionCommandSchema,
  CloneRepoCommandSchema,
  SetWorkingDirCommandSchema,
  SetModelCommandSchema,
  SetAllowedToolsCommandSchema,
  SaveSessionCommandSchema,
  RestoreSessionCommandSchema,
]);

// ============================================================================
// OUTGOING: Messages sent FROM the chimp
// ============================================================================

/**
 * Specific response schemas for commands that need responses
 */

// send-agent-message response
export const AgentMessageResponseSchema = z.object({
  type: z.literal("agent-message-response"),
  content: z.string(),
  sessionId: z.string(),
});

// get-status response
export const StatusResponseSchema = z.object({
  type: z.literal("status-response"),
  sessionId: z.string().optional(),
  messageCount: z.number(),
  model: z.string(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// save-session response
export const SaveSessionResponseSchema = z.object({
  type: z.literal("save-session-response"),
  s3Path: z.string(),
  sessionId: z.string(),
});

/**
 * Autonomous messages - sent by chimp without a specific command prompt
 */

// Artifact message (e.g., file created, test result, etc.)
export const ArtifactMessageSchema = z.object({
  type: z.literal("artifact"),
  artifactType: z.string(), // e.g., "file", "test-result", "screenshot"
  name: z.string(),
  content: z.unknown(), // flexible content based on artifact type
  metadata: z.record(z.string(), z.unknown()).optional(),
});

// Progress update
export const ProgressMessageSchema = z.object({
  type: z.literal("progress"),
  message: z.string(),
  percentage: z.number().min(0).max(100).optional(),
});

// Log message
export const LogMessageSchema = z.object({
  type: z.literal("log"),
  level: z.enum(["debug", "info", "warn", "error"]),
  message: z.string(),
  timestamp: z.string(),
});

/**
 * Error response (can be sent for any command)
 */
export const ErrorResponseSchema = z.object({
  type: z.literal("error"),
  error: z.string(),
  command: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

/**
 * Union of all outgoing message types (using discriminated union)
 */
export const ChimpOutputMessageSchema = z.discriminatedUnion("type", [
  // Command responses
  AgentMessageResponseSchema,
  StatusResponseSchema,
  SaveSessionResponseSchema,
  // Autonomous messages
  ArtifactMessageSchema,
  ProgressMessageSchema,
  LogMessageSchema,
  // Error
  ErrorResponseSchema,
]);

/**
 * Initialization configuration schema
 *
 * Configuration file format for chimp initialization.
 * Contains an array of commands to process before runtime.
 */
export const InitConfigSchema = z.object({
  version: z.string(),
  commands: z.array(ChimpCommandSchema),
});

// ============================================================================
// TypeScript types
// ============================================================================

// Incoming command types
export type ChimpCommand = z.infer<typeof ChimpCommandSchema>;

// Outgoing message types - specific responses
export type AgentMessageResponse = z.infer<typeof AgentMessageResponseSchema>;
export type StatusResponse = z.infer<typeof StatusResponseSchema>;
export type SaveSessionResponse = z.infer<typeof SaveSessionResponseSchema>;

// Outgoing message types - autonomous messages
export type ArtifactMessage = z.infer<typeof ArtifactMessageSchema>;
export type ProgressMessage = z.infer<typeof ProgressMessageSchema>;
export type LogMessage = z.infer<typeof LogMessageSchema>;

// Error type
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// Union of all output message types
export type ChimpOutputMessage = z.infer<typeof ChimpOutputMessageSchema>;

// Config type
export type InitConfig = z.infer<typeof InitConfigSchema>;

// ============================================================================
// Validation functions
// ============================================================================

/**
 * Parse and validate an incoming command
 * @throws ZodError if validation fails
 */
export function parseChimpCommand(payload: unknown): ChimpCommand {
  return ChimpCommandSchema.parse(payload);
}

/**
 * Safely parse an incoming command
 * Returns success: true with data, or success: false with error
 */
export function safeParseChimpCommand(payload: unknown) {
  return ChimpCommandSchema.safeParse(payload);
}

/**
 * Parse and validate an outgoing message
 * @throws ZodError if validation fails
 */
export function parseChimpOutputMessage(payload: unknown): ChimpOutputMessage {
  return ChimpOutputMessageSchema.parse(payload);
}

/**
 * Safely parse an outgoing message
 * Returns success: true with data, or success: false with error
 */
export function safeParseChimpOutputMessage(payload: unknown) {
  return ChimpOutputMessageSchema.safeParse(payload);
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

// ============================================================================
// Helper functions for creating commands (incoming)
// ============================================================================

/**
 * Extract prompt from an agent command
 */
export function extractPrompt(cmd: ChimpCommand): string {
  if (cmd.command !== "send-agent-message") {
    throw new Error("Cannot extract prompt from non-agent command");
  }
  if (!cmd.args || !("prompt" in cmd.args)) {
    throw new Error("Agent command missing prompt in args");
  }
  return cmd.args.prompt;
}

/**
 * Create a send-agent-message command
 */
export function createAgentCommand(prompt: string): ChimpCommand {
  return {
    command: "send-agent-message",
    args: { prompt },
  };
}

/**
 * Create specific commands
 */
export function createCloneRepoCommand(
  url: string,
  branch?: string,
  path?: string,
): ChimpCommand {
  return {
    command: "clone-repo",
    args: { url, branch, path },
  };
}

export function createSetWorkingDirCommand(path: string): ChimpCommand {
  return {
    command: "set-working-dir",
    args: { path },
  };
}

export function createSetModelCommand(model: string): ChimpCommand {
  return {
    command: "set-model",
    args: { model },
  };
}

export function createSetAllowedToolsCommand(tools: string[]): ChimpCommand {
  return {
    command: "set-allowed-tools",
    args: { tools },
  };
}

export function createSaveSessionCommand(): ChimpCommand {
  return {
    command: "save-session",
    args: { method: "s3" },
  };
}

export function createRestoreSessionCommand(sessionId: string): ChimpCommand {
  return {
    command: "restore-session",
    args: { sessionId, method: "s3" },
  };
}

/**
 * Create an initialization configuration
 */
export function createInitConfig(commands: ChimpCommand[]): InitConfig {
  return {
    version: PROTOCOL_VERSION,
    commands,
  };
}

// ============================================================================
// Helper functions for creating output messages (outgoing)
// ============================================================================

/**
 * Create an agent message response
 */
export function createAgentMessageResponse(
  content: string,
  sessionId: string,
): AgentMessageResponse {
  return {
    type: "agent-message-response",
    content,
    sessionId,
  };
}

/**
 * Create a status response
 */
export function createStatusResponse(
  data: Omit<StatusResponse, "type">,
): StatusResponse {
  return {
    type: "status-response",
    ...data,
  };
}

/**
 * Create a save session response
 */
export function createSaveSessionResponse(
  s3Path: string,
  sessionId: string,
): SaveSessionResponse {
  return {
    type: "save-session-response",
    s3Path,
    sessionId,
  };
}

/**
 * Create an error response
 */
export function createErrorResponse(
  error: string,
  command?: string,
  details?: Record<string, unknown>,
): ErrorResponse {
  return {
    type: "error",
    error,
    command,
    details,
  };
}

/**
 * Create an artifact message
 */
export function createArtifactMessage(
  artifactType: string,
  name: string,
  content: unknown,
  metadata?: Record<string, unknown>,
): ArtifactMessage {
  return {
    type: "artifact",
    artifactType,
    name,
    content,
    metadata,
  };
}

/**
 * Create a progress message
 */
export function createProgressMessage(
  message: string,
  percentage?: number,
): ProgressMessage {
  return {
    type: "progress",
    message,
    percentage,
  };
}

/**
 * Create a log message
 */
export function createLogMessage(
  level: LogMessage["level"],
  message: string,
  timestamp?: string,
): LogMessage {
  return {
    type: "log",
    level,
    message,
    timestamp: timestamp || new Date().toISOString(),
  };
}
