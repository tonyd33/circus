/**
 * Chimp Protocol - Message validation and types
 *
 * Defines the protocol for communicating with Chimp agents via Conduit exchanges.
 * Provides Zod schemas for validation and TypeScript types for type safety.
 */

import { z } from "zod";
import { TopicSchema } from "./standards/topic";

/**
 * Protocol version
 */
export const PROTOCOL_VERSION = "0.1.0";

// ============================================================================
// INCOMING: Commands sent TO the chimp
// ============================================================================

/**
 * GitHub webhook event context.
 *
 * A discriminated union keyed by `name` that mirrors the GitHub webhook
 * events circus consumes, carrying only the properties relevant to us.
 * Adding support for a new event type is a matter of adding a new
 * variant here; consumers that switch on `name` get exhaustiveness
 * checks for free.
 *
 * The `name` value matches the `<event>.<action>` form used by
 * `@octokit/webhooks` (e.g. `issue_comment.created`).
 */
export const GithubEventSchema = z.discriminatedUnion("name", [
  z.object({
    name: z.literal("issue_comment.created"),
    issueNumber: z.number(),
    isPR: z.boolean(),
    commentId: z.number(),
    author: z.string(),
  }),
  z.object({
    name: z.literal("pull_request_review_comment.created"),
    prNumber: z.number(),
    commentId: z.number(),
    author: z.string(),
    filePath: z.string(),
  }),
  z.object({
    name: z.literal("issues.opened"),
    issueNumber: z.number(),
    author: z.string(),
    title: z.string(),
  }),
  z.object({
    name: z.literal("issues.labeled"),
    issueNumber: z.number(),
    labelName: z.string(),
    author: z.string(),
  }),
  z.object({
    name: z.literal("pull_request.labeled"),
    prNumber: z.number(),
    labelName: z.string(),
    author: z.string(),
  }),
]);
export type GithubEvent = z.infer<typeof GithubEventSchema>;

export const EventContextSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("discord"),
    interactionToken: z.string(),
    applicationId: z.string(),
    channelId: z.string(),
  }),
  z.object({
    source: z.literal("github"),
    repo: z.string(),
    installationId: z.number().optional(),
    event: GithubEventSchema,
  }),
  z.object({ source: z.literal("dashboard") }),
  z.object({ source: z.literal("unknown") }),
]);
export type EventContext = z.infer<typeof EventContextSchema>;

export const StoredEventContextSchema = z.object({
  seenAt: z.string(),
  context: EventContextSchema,
});
export type StoredEventContext = z.infer<typeof StoredEventContextSchema>;

const SendAgentMessageCommandSchema = z.object({
  command: z.literal("send-agent-message"),
  args: z.object({
    prompt: z.string(),
    context: EventContextSchema.optional(),
  }),
});

const StopCommandSchema = z.object({
  command: z.literal("stop"),
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

const SetSystemPromptCommandSchema = z.object({
  command: z.literal("set-system-prompt"),
  args: z.object({
    prompt: z.string(),
  }),
});

const AppendSystemPromptCommandSchema = z.object({
  command: z.literal("append-system-prompt"),
  args: z.object({
    prompt: z.string(),
  }),
});

const SetAllowedToolsCommandSchema = z.object({
  command: z.literal("set-allowed-tools"),
  args: z.object({
    tools: z.array(z.string()),
  }),
});

const SetupGithubAuthCommandSchema = z.object({
  command: z.literal("setup-github-auth"),
});

const GhCloneRepoCommandSchema = z.object({
  command: z.literal("gh-clone-repo"),
  args: z.object({
    repo: z.string(),
    path: z.string().optional(),
    branch: z.string().optional(),
  }),
});

const ResumeTransmogrifyCommandSchema = z.object({
  command: z.literal("resume-transmogrify"),
  args: z.object({
    fromProfile: z.string(),
    reason: z.string(),
    summary: z.string(),
    eventContexts: z.array(StoredEventContextSchema).default([]),
  }),
});

const ResumeHandoffCommandSchema = z.object({
  command: z.literal("resume-handoff"),
  args: z.object({
    fromProfile: z.string(),
    reason: z.string(),
    summary: z.string(),
    subscriptions: z.array(TopicSchema).default([]),
    eventContexts: z.array(StoredEventContextSchema).default([]),
  }),
});

const ChimpCommandSchema = z.discriminatedUnion("command", [
  SendAgentMessageCommandSchema,
  StopCommandSchema,
  CloneRepoCommandSchema,
  GhCloneRepoCommandSchema,
  SetWorkingDirCommandSchema,
  SetSystemPromptCommandSchema,
  AppendSystemPromptCommandSchema,
  SetAllowedToolsCommandSchema,
  SetupGithubAuthCommandSchema,
  ResumeTransmogrifyCommandSchema,
  ResumeHandoffCommandSchema,
]);

// ============================================================================
// CHIMP PROFILE TYPES
// ============================================================================

export const BrainTypeEnum = z.enum(["claude", "opencode", "echo"]);
export type ChimpBrainType = z.infer<typeof BrainTypeEnum>;

/**
 * K8s resource schemas for chimp job configuration
 */
export const EnvVarSourceSchema = z.object({
  secretKeyRef: z
    .object({
      name: z.string(),
      key: z.string(),
      optional: z.boolean().optional(),
    })
    .optional(),
  configMapKeyRef: z
    .object({
      name: z.string(),
      key: z.string(),
      optional: z.boolean().optional(),
    })
    .optional(),
  fieldRef: z.object({ fieldPath: z.string() }).optional(),
});

export const EnvVarSchema = z.object({
  name: z.string(),
  value: z.string().optional(),
  valueFrom: EnvVarSourceSchema.optional(),
});

export const VolumeMountSchema = z.object({
  name: z.string(),
  mountPath: z.string(),
  subPath: z.string().optional(),
  readOnly: z.boolean().optional(),
});

export const VolumeSchema = z.object({
  name: z.string(),
  secret: z
    .object({
      secretName: z.string(),
      optional: z.boolean().optional(),
    })
    .optional(),
  configMap: z
    .object({
      name: z.string(),
      optional: z.boolean().optional(),
    })
    .optional(),
  emptyDir: z
    .object({
      medium: z.string().optional(),
      sizeLimit: z.string().optional(),
    })
    .optional(),
  persistentVolumeClaim: z
    .object({
      claimName: z.string(),
      readOnly: z.boolean().optional(),
    })
    .optional(),
});

/**
 * Chimp profile configuration
 */
export const ChimpProfileSchema = z.object({
  brain: BrainTypeEnum,
  model: z.string(),
  image: z.string(),
  description: z.string().optional(),
  extraEnv: z.array(EnvVarSchema).default([]),
  volumeMounts: z.array(VolumeMountSchema).default([]),
  volumes: z.array(VolumeSchema).default([]),
  imagePullPolicy: z.string().optional(),
  initCommands: z.array(ChimpCommandSchema).default([]),
});
export type ChimpProfile = z.infer<typeof ChimpProfileSchema>;

// ============================================================================
// OUTGOING: Messages sent FROM the chimp
// ============================================================================

export const AgentMessageResponseSchema = z.object({
  type: z.literal("agent-message-response"),
  content: z.string(),
  sessionId: z.string(),
});

export const ArtifactMessageSchema = z.object({
  type: z.literal("artifact"),
  artifactType: z.string(), // e.g., "file", "test-result", "screenshot"
  name: z.string(),
  content: z.unknown(), // flexible content based on artifact type
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const ProgressMessageSchema = z.object({
  type: z.literal("progress"),
  message: z.string(),
  percentage: z.number().min(0).max(100).optional(),
});

export const LogMessageSchema = z.object({
  type: z.literal("log"),
  level: z.enum(["debug", "info", "warn", "error"]),
  message: z.string(),
  timestamp: z.string(),
  data: z.record(z.string(), z.unknown()).optional(),
});

export const ErrorResponseSchema = z.object({
  type: z.literal("error"),
  error: z.string(),
  command: z.string().optional(),
  details: z.record(z.string(), z.unknown()).optional(),
});

export const ThoughtSchema = z.object({
  type: z.literal("thought"),
  brain: BrainTypeEnum,
  event: z.unknown(),
});

export const ChimpRequestSchema = z.object({
  type: z.literal("chimp-request"),
  profile: z.string(),
  chimpId: z.string(),
  message: z.string(),
});

export const DiscordResponseSchema = z.object({
  type: z.literal("discord-response"),
  interactionToken: z.string(),
  applicationId: z.string(),
  content: z.string(),
});

export const GithubCommentSchema = z.object({
  type: z.literal("github-comment"),
  installationId: z.number(),
  repo: z.string(),
  issueNumber: z.number(),
  content: z.string(),
  in_reply_to_id: z.number().optional(),
});

export const TransmogrifySchema = z.object({
  type: z.literal("transmogrify"),
  fromProfile: z.string(),
  targetProfile: z.string(),
  reason: z.string(),
  summary: z.string(),
  eventContexts: z.array(StoredEventContextSchema).default([]),
});

export const ChimpHandoffSchema = z.object({
  type: z.literal("chimp-handoff"),
  targetProfile: z.string(),
  reason: z.string(),
  summary: z.string(),
  subscriptions: z.array(TopicSchema).default([]),
  eventContexts: z.array(StoredEventContextSchema).default([]),
});

export const HandoffCompleteSchema = z.object({
  type: z.literal("handoff-complete"),
  fromChimpId: z.string(),
  toChimpId: z.string(),
  unsubscribedCount: z.number(),
});

export const ChimpOutputMessageSchema = z.discriminatedUnion("type", [
  AgentMessageResponseSchema,
  ArtifactMessageSchema,
  ProgressMessageSchema,
  LogMessageSchema,
  ErrorResponseSchema,
  ThoughtSchema,
  ChimpRequestSchema,
  DiscordResponseSchema,
  GithubCommentSchema,
  TransmogrifySchema,
  ChimpHandoffSchema,
  HandoffCompleteSchema,
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
// META EVENTS
// ============================================================================

const MetaEventBase = z.object({
  chimpId: z.string(),
  timestamp: z.string(),
});

export const StatusMetaEventSchema = MetaEventBase.extend({
  type: z.literal("status"),
  profile: z.string(),
  status: z.enum([
    "scheduled",
    "pending",
    "running",
    "stopped",
    "failed",
    "unknown",
  ]),
});

export const BullhornDispatchedMetaEventSchema = MetaEventBase.extend({
  type: z.literal("bullhorn-dispatched"),
  outputSequence: z.number(),
});

export const MetaEventSchema = z.discriminatedUnion("type", [
  StatusMetaEventSchema,
  BullhornDispatchedMetaEventSchema,
]);

// ============================================================================
// TypeScript types
// ============================================================================

// Incoming command types
export type ChimpCommand = z.infer<typeof ChimpCommandSchema>;

// Outgoing message types - specific responses
export type AgentMessageResponse = z.infer<typeof AgentMessageResponseSchema>;
export type DiscordResponse = z.infer<typeof DiscordResponseSchema>;
export type GithubComment = z.infer<typeof GithubCommentSchema>;

// Outgoing message types - autonomous messages
export type ArtifactMessage = z.infer<typeof ArtifactMessageSchema>;
export type ProgressMessage = z.infer<typeof ProgressMessageSchema>;
export type LogMessage = z.infer<typeof LogMessageSchema>;

// Error type
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;

// Thought type
export type Thought = z.infer<typeof ThoughtSchema>;

// Union of all output message types
export type ChimpOutputMessage = z.infer<typeof ChimpOutputMessageSchema>;

// Config type
export type InitConfig = z.infer<typeof InitConfigSchema>;

// Meta event types
export type MetaEvent = z.infer<typeof MetaEventSchema>;

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
 * Create a send-agent-message command
 */
export function createAgentCommand(
  prompt: string,
  context?: EventContext,
): ChimpCommand {
  return {
    command: "send-agent-message",
    args: { prompt, ...(context && { context }) },
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
  data?: Record<string, unknown>,
  timestamp?: string,
): LogMessage {
  return {
    type: "log",
    level,
    message,
    timestamp: timestamp || new Date().toISOString(),
    ...(data && { data }),
  };
}

/**
 * Create a thought message (brain-specific event)
 */
export function createThought(brain: ChimpBrainType, event: unknown): Thought {
  return {
    type: "thought",
    brain,
    event,
  };
}

/**
 * Create a Discord response message. Consumed by bullhorn's Discord
 * output handler, which posts it as the response to the originating
 * interaction.
 */
export function createDiscordResponse(args: {
  interactionToken: string;
  applicationId: string;
  content: string;
}): DiscordResponse {
  return {
    type: "discord-response",
    interactionToken: args.interactionToken,
    applicationId: args.applicationId,
    content: args.content,
  };
}

/**
 * Create a GitHub comment message. Consumed by bullhorn's GitHub output
 * handler, which posts the content as a comment on the given issue/PR
 * using the installation token for `installationId`.
 */
export function createGithubComment(args: {
  installationId: number;
  repo: string;
  issueNumber: number;
  content: string;
  in_reply_to_id?: number;
}): GithubComment {
  return {
    type: "github-comment",
    installationId: args.installationId,
    repo: args.repo,
    issueNumber: args.issueNumber,
    content: args.content,
    ...(args.in_reply_to_id !== undefined && {
      in_reply_to_id: args.in_reply_to_id,
    }),
  };
}
