/**
 * Usher - Types
 *
 * The Usher guides events from various sources to their appropriate Chimp sessions
 */

/**
 * Supported event sources
 */
export type EventSource = "github" | "jira" | "slack" | "discord" | "test";

/**
 * Session state
 */
export type SessionState = "active" | "idle";

/**
 * Source-specific identifiers for correlation
 */
export interface SessionIdentifiers {
  // Slack
  channelId?: string;
  threadId?: string;

  // GitHub
  issueKey?: string;
  prNumber?: number;
  repoFullName?: string;

  // Jira
  jiraIssueKey?: string;

  // Discord
  discordChannelId?: string;
  discordThreadId?: string;

  // Common
  userId?: string;
}

/**
 * Session context
 */
export interface SessionContext {
  source: EventSource;
  identifiers: SessionIdentifiers;
  userId?: string;
}

/**
 * A session maps to a Chimp Exchange
 */
export interface Session {
  /** Exchange name (this IS the session ID) */
  exchangeName: string;

  /** Context for correlation */
  context: SessionContext;

  /** Creation timestamp (Unix ms) */
  createdAt: number;

  /** Last activity timestamp (Unix ms) */
  lastActivityAt: number;

  /** Session state */
  state: SessionState;
}

/**
 * Normalized event from any source
 */
export interface NormalizedEvent {
  /** Source of the event */
  source: EventSource;

  /** Event type (e.g., "message", "comment", "pr_review") */
  eventType: string;

  /** Identifiers for correlation */
  identifiers: SessionIdentifiers;

  /** User who triggered the event */
  userId?: string;

  /** Event content/message */
  content: string;

  /** Original event payload (for debugging) */
  raw?: unknown;
}

/**
 * Correlation result
 */
export interface CorrelationResult {
  /** The session (exchange name) to use */
  exchangeName: string;

  /** Whether this is a new session */
  isNew: boolean;

  /** The session data */
  session: Session;
}
