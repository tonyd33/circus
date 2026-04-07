/**
 * Usher - Correlator
 *
 * Fast correlation logic (<1s) to match events to sessions
 */

import { SessionStore } from "./session-store.ts";
import type { NormalizedEvent, CorrelationResult, Session } from "./types.ts";

/**
 * Event correlator that matches events to sessions
 */
export class Correlator {
  constructor(private sessionStore: SessionStore) {}

  /**
   * Correlate an event to a session
   *
   * Simple exact matching: Only correlate to existing session if
   * source, channelId (or equivalent), and userId ALL exactly match.
   * Otherwise, create a new session.
   *
   * Target: < 50ms
   */
  async correlate(event: NormalizedEvent): Promise<CorrelationResult> {
    const { identifiers, userId, source } = event;

    // Generate the exchange name that would be created for this event
    const expectedExchangeName = this.generateExchangeName(event);

    // Try to find an existing session with this exact exchange name
    const existingSession =
      await this.sessionStore.getSession(expectedExchangeName);

    if (existingSession) {
      // Verify it matches source, channelId/equivalent, and userId
      const channelId = identifiers.channelId || identifiers.discordChannelId;
      const existingChannelId =
        existingSession.context.identifiers.channelId ||
        existingSession.context.identifiers.discordChannelId;

      if (
        existingSession.context.source === source &&
        existingChannelId === channelId &&
        existingSession.context.userId === userId
      ) {
        // Exact match found - update activity and return
        await this.sessionStore.updateActivity(expectedExchangeName);
        return {
          exchangeName: expectedExchangeName,
          isNew: false,
          session: existingSession,
        };
      }
    }

    // No match found - create new session
    const newSession = await this.createNewSession(event);
    return {
      exchangeName: newSession.exchangeName,
      isNew: true,
      session: newSession,
    };
  }

  /**
   * Create a new session for an event
   * @private
   */
  private async createNewSession(event: NormalizedEvent): Promise<Session> {
    const now = Date.now();

    // Generate exchange name from identifiers
    const exchangeName = this.generateExchangeName(event);

    const session: Session = {
      exchangeName,
      context: {
        source: event.source,
        identifiers: event.identifiers,
        userId: event.userId,
      },
      createdAt: now,
      lastActivityAt: now,
      state: "active",
    };

    // Save to Redis
    await this.sessionStore.saveSession(session);

    return session;
  }

  /**
   * Generate a unique exchange name from event identifiers
   * @private
   */
  private generateExchangeName(event: NormalizedEvent): string {
    const { source, identifiers } = event;

    // Priority: most specific identifier first
    if (identifiers.threadId) {
      return `${source}-${identifiers.channelId}-${identifiers.threadId}`;
    }
    if (identifiers.discordThreadId) {
      return `${source}-${identifiers.discordChannelId}-${identifiers.discordThreadId}`;
    }
    if (identifiers.issueKey) {
      return `${source}-${identifiers.issueKey}`;
    }
    if (identifiers.jiraIssueKey) {
      return `${source}-${identifiers.jiraIssueKey}`;
    }
    if (identifiers.repoFullName && identifiers.prNumber !== undefined) {
      const repoSlug = identifiers.repoFullName.replace("/", "-");
      return `${source}-${repoSlug}-pr-${identifiers.prNumber}`;
    }
    if (identifiers.channelId) {
      return `${source}-${identifiers.channelId}`;
    }
    if (identifiers.discordChannelId) {
      return `${source}-${identifiers.discordChannelId}`;
    }

    // Fallback: use timestamp and random ID
    const timestamp = Date.now().toString(36);
    const random = Math.random().toString(36).substring(2, 8);
    return `${source}-${timestamp}-${random}`;
  }
}
