/**
 * Usher - Test Event Adapter
 *
 * Normalizes test events for simulating other event sources
 */

import type { NormalizedEvent, EventSource } from "../types.ts";

/**
 * Test event payload
 *
 * Simulates events from other sources (Slack, GitHub, Jira, Discord)
 * for testing purposes.
 */
export interface TestEventPayload {
  /**
   * Source to simulate: "slack" | "github" | "jira" | "discord"
   * Defaults to "slack"
   */
  source?: EventSource;

  /**
   * Event type (e.g., "message", "comment", "pr_review")
   * Defaults to "message"
   */
  eventType?: string;

  /**
   * Message content (required)
   */
  content: string;

  /**
   * User ID
   */
  userId?: string;

  /**
   * Channel/repo/project identifiers (depends on source)
   *
   * For Slack: channelId, threadId
   * For GitHub: repoFullName, issueKey/prNumber
   * For Jira: jiraIssueKey
   * For Discord: discordChannelId, discordThreadId
   */
  channelId?: string;
  threadId?: string;
  repoFullName?: string;
  issueKey?: string;
  prNumber?: number;
  jiraIssueKey?: string;
  discordChannelId?: string;
  discordThreadId?: string;
}

/**
 * Normalize a test event to the common format
 *
 * Examples:
 *
 * Simulate Slack message:
 * {
 *   "source": "slack",
 *   "content": "Hello world",
 *   "channelId": "C123",
 *   "userId": "U456"
 * }
 *
 * Simulate GitHub PR comment:
 * {
 *   "source": "github",
 *   "eventType": "pr_comment",
 *   "content": "LGTM",
 *   "repoFullName": "myorg/myrepo",
 *   "prNumber": 123,
 *   "userId": "user123"
 * }
 *
 * Simulate Jira comment:
 * {
 *   "source": "jira",
 *   "content": "Updated the ticket",
 *   "jiraIssueKey": "PROJ-123",
 *   "userId": "user@example.com"
 * }
 */
export function normalizeTestEvent(payload: unknown): NormalizedEvent | null {
  // Type guard
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const p = payload as TestEventPayload;

  // Require content
  if (!p.content || typeof p.content !== "string") {
    return null;
  }

  // Default to slack if not specified
  const source = p.source || "slack";
  const eventType = p.eventType || "message";

  return {
    source,
    eventType,
    identifiers: {
      channelId: p.channelId,
      threadId: p.threadId,
      repoFullName: p.repoFullName,
      issueKey: p.issueKey,
      prNumber: p.prNumber,
      jiraIssueKey: p.jiraIssueKey,
      discordChannelId: p.discordChannelId,
      discordThreadId: p.discordThreadId,
      userId: p.userId,
    },
    userId: p.userId,
    content: p.content,
    raw: payload,
  };
}
