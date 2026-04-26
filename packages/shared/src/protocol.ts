import { z } from "zod";
import { TopicSchema } from "./standards/topic";

export const PROTOCOL_VERSION = "0.1.0";

// ── Commands (incoming to chimp) ───────────────────────────────────────

// name matches octokit webhook <event>.<action> form
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

const StopCommandSchema = z.object({ command: z.literal("stop") });

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
  args: z.object({ path: z.string() }),
});

const SetSystemPromptCommandSchema = z.object({
  command: z.literal("set-system-prompt"),
  args: z.object({ prompt: z.string() }),
});

const AppendSystemPromptCommandSchema = z.object({
  command: z.literal("append-system-prompt"),
  args: z.object({ prompt: z.string() }),
});

const SetAllowedToolsCommandSchema = z.object({
  command: z.literal("set-allowed-tools"),
  args: z.object({ tools: z.array(z.string()) }),
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

const SubscribeTopicCommandSchema = z.object({
  command: z.literal("subscribe-topic"),
  args: z.object({ topic: TopicSchema }),
});

const UnsubscribeTopicCommandSchema = z.object({
  command: z.literal("unsubscribe-topic"),
  args: z.object({ topic: TopicSchema }),
});

const AddEventContextCommandSchema = z.object({
  command: z.literal("add-event-context"),
  args: z.object({ context: EventContextSchema }),
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
  SubscribeTopicCommandSchema,
  UnsubscribeTopicCommandSchema,
  AddEventContextCommandSchema,
]);

// ── Chimp profiles ─────────────────────────────────────────────────────

export const BrainTypeEnum = z.enum(["claude", "opencode", "echo"]);
export type ChimpBrainType = z.infer<typeof BrainTypeEnum>;

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
    .object({ secretName: z.string(), optional: z.boolean().optional() })
    .optional(),
  configMap: z
    .object({ name: z.string(), optional: z.boolean().optional() })
    .optional(),
  emptyDir: z
    .object({ medium: z.string().optional(), sizeLimit: z.string().optional() })
    .optional(),
  persistentVolumeClaim: z
    .object({ claimName: z.string(), readOnly: z.boolean().optional() })
    .optional(),
});

export const AuthProviderConfigSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("env"),
    envVar: z.string(),
  }),
  z.object({
    source: z.literal("redis"),
    key: z.string(),
  }),
]);
export type AuthProviderConfig = z.infer<typeof AuthProviderConfigSchema>;

export const AuthConfigSchema = z.record(z.string(), AuthProviderConfigSchema);
export type AuthConfig = z.infer<typeof AuthConfigSchema>;

export const ChimpProfileSchema = z.object({
  brain: BrainTypeEnum,
  provider: z.string(),
  model: z.string(),
  image: z.string(),
  description: z.string().optional(),
  extraEnv: z.array(EnvVarSchema).default([]),
  volumeMounts: z.array(VolumeMountSchema).default([]),
  volumes: z.array(VolumeSchema).default([]),
  imagePullPolicy: z.string().optional(),
  initCommands: z.array(ChimpCommandSchema).default([]),
  auth: AuthConfigSchema.default({}),
});
export type ChimpProfile = z.infer<typeof ChimpProfileSchema>;

// ── Outputs (from chimp) ───────────────────────────────────────────────

export const AgentMessageResponseSchema = z.object({
  type: z.literal("agent-message-response"),
  content: z.string(),
  sessionId: z.string(),
});

export const ArtifactMessageSchema = z.object({
  type: z.literal("artifact"),
  artifactType: z.string(),
  name: z.string(),
  content: z.unknown(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const ProgressMessageSchema = z.object({
  type: z.literal("progress"),
  message: z.string(),
  percentage: z.number().min(0).max(100).optional(),
});

export const CommandReceivedSchema = z.object({
  type: z.literal("command-received"),
  command: z.string(),
  payload: ChimpCommandSchema,
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

export const ChimpCommandOutputSchema = z.object({
  type: z.literal("chimp-command"),
  targetChimpId: z.string(),
  command: ChimpCommandSchema,
});

export const ChimpOutputMessageSchema = z.discriminatedUnion("type", [
  AgentMessageResponseSchema,
  ArtifactMessageSchema,
  ProgressMessageSchema,
  CommandReceivedSchema,
  ErrorResponseSchema,
  ThoughtSchema,
  ChimpRequestSchema,
  ChimpCommandOutputSchema,
  DiscordResponseSchema,
  GithubCommentSchema,
]);

export const InitConfigSchema = z.object({
  version: z.string(),
  commands: z.array(ChimpCommandSchema),
});

// ── Meta events ────────────────────────────────────────────────────────

const MetaEventBase = z.object({
  chimpId: z.string(),
  timestamp: z.string(),
});

export const StatusMetaEventSchema = MetaEventBase.extend({
  type: z.literal("status"),
  status: z.enum([
    "scheduled",
    "pending",
    "running",
    "stopped",
    "failed",
    "unknown",
  ]),
});

export const ProfileMetaEventSchema = MetaEventBase.extend({
  type: z.literal("profile"),
  profile: z.string(),
});

export const TopicsMetaEventSchema = MetaEventBase.extend({
  type: z.literal("topics"),
  topics: z.array(TopicSchema),
});

export const BullhornDispatchedMetaEventSchema = MetaEventBase.extend({
  type: z.literal("bullhorn-dispatched"),
  outputSequence: z.number(),
});

export const MetaEventSchema = z.discriminatedUnion("type", [
  StatusMetaEventSchema,
  ProfileMetaEventSchema,
  TopicsMetaEventSchema,
  BullhornDispatchedMetaEventSchema,
]);

// ── Orchestration actions ──────────────────────────────────────────────

const DeliverFromSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("sequence"), value: z.number() }),
  z.object({ type: z.literal("time"), value: z.coerce.date() }),
]);

export const SetProfileActionSchema = z.object({
  type: z.literal("set-profile"),
  chimpId: z.string(),
  profile: z.string(),
});

export const SubscribeTopicActionSchema = z.object({
  type: z.literal("subscribe-topic"),
  chimpId: z.string(),
  topic: TopicSchema,
});

export const SetTopicsActionSchema = z.object({
  type: z.literal("set-topics"),
  chimpId: z.string(),
  topics: z.array(TopicSchema),
});

export const UnsubscribeTopicActionSchema = z.object({
  type: z.literal("unsubscribe-topic"),
  chimpId: z.string(),
  topic: TopicSchema,
});

export const EnsureConsumersActionSchema = z.object({
  type: z.literal("ensure-consumers"),
  chimpId: z.string(),
  deliverFrom: DeliverFromSchema.optional(),
});

export const EnsureJobActionSchema = z.object({
  type: z.literal("ensure-job"),
  chimpId: z.string(),
});

export const DeleteChimpActionSchema = z.object({
  type: z.literal("delete-chimp"),
  chimpId: z.string(),
});

export const OrchestrationActionSchema = z.discriminatedUnion("type", [
  SetProfileActionSchema,
  SubscribeTopicActionSchema,
  SetTopicsActionSchema,
  UnsubscribeTopicActionSchema,
  EnsureConsumersActionSchema,
  EnsureJobActionSchema,
  DeleteChimpActionSchema,
]);

// ── Types ──────────────────────────────────────────────────────────────

export type ChimpCommand = z.infer<typeof ChimpCommandSchema>;
export type AgentMessageResponse = z.infer<typeof AgentMessageResponseSchema>;
export type DiscordResponse = z.infer<typeof DiscordResponseSchema>;
export type GithubComment = z.infer<typeof GithubCommentSchema>;
export type ArtifactMessage = z.infer<typeof ArtifactMessageSchema>;
export type ProgressMessage = z.infer<typeof ProgressMessageSchema>;
export type CommandReceived = z.infer<typeof CommandReceivedSchema>;
export type ChimpCommandOutput = z.infer<typeof ChimpCommandOutputSchema>;
export type ErrorResponse = z.infer<typeof ErrorResponseSchema>;
export type Thought = z.infer<typeof ThoughtSchema>;
export type ChimpOutputMessage = z.infer<typeof ChimpOutputMessageSchema>;
export type InitConfig = z.infer<typeof InitConfigSchema>;
export type MetaEvent = z.infer<typeof MetaEventSchema>;
export type ProfileMetaEvent = z.infer<typeof ProfileMetaEventSchema>;
export type TopicsMetaEvent = z.infer<typeof TopicsMetaEventSchema>;
export type OrchestrationAction = z.infer<typeof OrchestrationActionSchema>;
export type SetProfileAction = z.infer<typeof SetProfileActionSchema>;
export type SubscribeTopicAction = z.infer<typeof SubscribeTopicActionSchema>;
export type SetTopicsAction = z.infer<typeof SetTopicsActionSchema>;
export type UnsubscribeTopicAction = z.infer<
  typeof UnsubscribeTopicActionSchema
>;
export type EnsureConsumersAction = z.infer<typeof EnsureConsumersActionSchema>;
export type EnsureJobAction = z.infer<typeof EnsureJobActionSchema>;
export type DeleteChimpAction = z.infer<typeof DeleteChimpActionSchema>;

// ── Parse helpers ──────────────────────────────────────────────────────

export function parseChimpCommand(payload: unknown): ChimpCommand {
  return ChimpCommandSchema.parse(payload);
}

export function safeParseChimpCommand(payload: unknown) {
  return ChimpCommandSchema.safeParse(payload);
}

export function parseChimpOutputMessage(payload: unknown): ChimpOutputMessage {
  return ChimpOutputMessageSchema.parse(payload);
}

export function safeParseChimpOutputMessage(payload: unknown) {
  return ChimpOutputMessageSchema.safeParse(payload);
}

export function parseInitConfig(config: unknown): InitConfig {
  return InitConfigSchema.parse(config);
}

export function safeParseInitConfig(config: unknown) {
  return InitConfigSchema.safeParse(config);
}

export function safeParseOrchestrationAction(payload: unknown) {
  return OrchestrationActionSchema.safeParse(payload);
}

// ── Factory helpers ────────────────────────────────────────────────────

export function createAgentCommand(
  prompt: string,
  context?: EventContext,
): ChimpCommand {
  return {
    command: "send-agent-message",
    args: { prompt, ...(context && { context }) },
  };
}

export function createCloneRepoCommand(
  url: string,
  branch?: string,
  path?: string,
): ChimpCommand {
  return { command: "clone-repo", args: { url, branch, path } };
}

export function createSetWorkingDirCommand(path: string): ChimpCommand {
  return { command: "set-working-dir", args: { path } };
}

export function createInitConfig(commands: ChimpCommand[]): InitConfig {
  return { version: PROTOCOL_VERSION, commands };
}

export function createAgentMessageResponse(
  content: string,
  sessionId: string,
): AgentMessageResponse {
  return { type: "agent-message-response", content, sessionId };
}

export function createErrorResponse(
  error: string,
  command?: string,
  details?: Record<string, unknown>,
): ErrorResponse {
  return { type: "error", error, command, details };
}

export function createArtifactMessage(
  artifactType: string,
  name: string,
  content: unknown,
  metadata?: Record<string, unknown>,
): ArtifactMessage {
  return { type: "artifact", artifactType, name, content, metadata };
}

export function createProgressMessage(
  message: string,
  percentage?: number,
): ProgressMessage {
  return { type: "progress", message, percentage };
}

export function createCommandReceived(payload: ChimpCommand): CommandReceived {
  return { type: "command-received", command: payload.command, payload };
}

export function createChimpCommandOutput(
  targetChimpId: string,
  command: ChimpCommand,
): ChimpCommandOutput {
  return { type: "chimp-command", targetChimpId, command };
}

export function createThought(brain: ChimpBrainType, event: unknown): Thought {
  return { type: "thought", brain, event };
}

// Consumed by bullhorn — posts as Discord interaction response
export function createDiscordResponse(args: {
  interactionToken: string;
  applicationId: string;
  content: string;
}): DiscordResponse {
  return { type: "discord-response", ...args };
}

// Consumed by bullhorn — posts as GitHub issue/PR comment
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
