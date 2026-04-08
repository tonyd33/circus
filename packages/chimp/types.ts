/**
 * Shared types and interfaces for Chimp application
 */
import type { ChimpCommand } from "@mnke/circus-shared/protocol";

/**
 * Application state tracking.
 */
export interface AppState {
  messageCount: number;
  sessionId?: string;
  model: string;
  allowedTools: string[];
  workingDir: string;
}

/**
 * Initialization configuration
 */
export interface InitConfig {
  version: string;
  commands: ChimpCommand[];
}

/**
 * Correlation event types
 */
export type CorrelationEvent =
  | { type: "github-pr"; repo: string; prNumber: number }
  | { type: "github-issue"; repo: string; issueNumber: number }
  | { type: "jira-issue"; issueKey: string }
  | { type: "slack-thread"; channelId: string; threadTs: string }
  | { type: "discord-thread"; channelId: string; threadId: string };

/**
 * Completion event types
 */
export interface CompletionEvent {
  type: "completion";
  chimpName: string;
  timestamp: number;
  reason: "idle_timeout" | "explicit_stop" | "error";
  messageCount: number;
  sessionId?: string;
}
