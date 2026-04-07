/**
 * Usher - Session Store
 *
 * Redis-backed session persistence for fast lookups and durability
 */

import Redis from "ioredis";
import type { Session, SessionState, EventSource } from "./types.ts";

/**
 * Session store using Redis for persistence
 */
export class SessionStore {
  private redis: Redis;

  constructor(redisUrl: string = "redis://localhost:6379") {
    this.redis = new Redis(redisUrl);
  }

  /**
   * Save a session to Redis
   */
  async saveSession(session: Session): Promise<void> {
    const key = `session:${session.exchangeName}`;

    // Store session data as a hash
    await this.redis.hset(
      key,
      "exchangeName",
      session.exchangeName,
      "source",
      session.context.source,
      "identifiers",
      JSON.stringify(session.context.identifiers),
      "userId",
      session.context.userId || "",
      "createdAt",
      session.createdAt.toString(),
      "lastActivityAt",
      session.lastActivityAt.toString(),
      "state",
      session.state,
    );

    // Set TTL based on idle timeout (default: 30 minutes)
    const idleTimeout = parseInt(
      process.env.SESSION_IDLE_TIMEOUT || "1800",
      10,
    );
    await this.redis.expire(key, idleTimeout);

    // Create lookup indexes
    await this.createIndexes(session);
  }

  /**
   * Get a session by exchange name
   */
  async getSession(exchangeName: string): Promise<Session | null> {
    const key = `session:${exchangeName}`;
    const data = await this.redis.hgetall(key);

    if (!data || Object.keys(data).length === 0) {
      return null;
    }

    // Validate required fields
    if (
      !data.exchangeName ||
      !data.source ||
      !data.identifiers ||
      !data.createdAt ||
      !data.lastActivityAt ||
      !data.state
    ) {
      return null;
    }

    return {
      exchangeName: data.exchangeName,
      context: {
        source: data.source as EventSource,
        identifiers: JSON.parse(data.identifiers),
        userId: data.userId || undefined,
      },
      createdAt: parseInt(data.createdAt, 10),
      lastActivityAt: parseInt(data.lastActivityAt, 10),
      state: data.state as SessionState,
    };
  }

  /**
   * Find session by channel ID (Slack/Discord)
   */
  async findByChannel(channelId: string): Promise<string | null> {
    const members = await this.redis.smembers(
      `sessions:by-channel:${channelId}`,
    );
    return members.length > 0 ? members[0] || null : null;
  }

  /**
   * Find session by thread ID
   */
  async findByThread(threadId: string): Promise<string | null> {
    const members = await this.redis.smembers(`sessions:by-thread:${threadId}`);
    return members.length > 0 ? members[0] || null : null;
  }

  /**
   * Find session by issue key (Jira/GitHub)
   */
  async findByIssue(issueKey: string): Promise<string | null> {
    const members = await this.redis.smembers(`sessions:by-issue:${issueKey}`);
    return members.length > 0 ? members[0] || null : null;
  }

  /**
   * Find session by PR (GitHub)
   */
  async findByPR(
    repoFullName: string,
    prNumber: number,
  ): Promise<string | null> {
    const key = `${repoFullName}-${prNumber}`;
    const members = await this.redis.smembers(`sessions:by-pr:${key}`);
    return members.length > 0 ? members[0] || null : null;
  }

  /**
   * Find user's most recent session (within time window)
   */
  async findRecentByUser(
    userId: string,
    withinMs: number = 300000, // 5 minutes
  ): Promise<string | null> {
    const now = Date.now();
    const minScore = now - withinMs;

    // Get sessions sorted by timestamp (most recent first)
    const sessions = await this.redis.zrevrangebyscore(
      `sessions:by-user:${userId}`,
      now.toString(),
      minScore.toString(),
      "LIMIT",
      "0",
      "1",
    );

    return sessions.length > 0 ? sessions[0] || null : null;
  }

  /**
   * Update session activity timestamp
   */
  async updateActivity(exchangeName: string): Promise<void> {
    const now = Date.now();
    const key = `session:${exchangeName}`;

    await this.redis.hset(key, "lastActivityAt", now.toString());

    // Update user index timestamp if applicable
    const session = await this.getSession(exchangeName);
    if (session?.context.userId) {
      await this.redis.zadd(
        `sessions:by-user:${session.context.userId}`,
        now,
        exchangeName,
      );
    }
  }

  /**
   * Delete a session
   */
  async deleteSession(exchangeName: string): Promise<void> {
    const session = await this.getSession(exchangeName);
    if (!session) return;

    // Delete session data
    await this.redis.del(`session:${exchangeName}`);

    // Delete indexes
    await this.deleteIndexes(session);
  }

  /**
   * Create lookup indexes for a session
   * @private
   */
  private async createIndexes(session: Session): Promise<void> {
    const { identifiers, userId } = session.context;
    const { exchangeName } = session;

    // Channel index
    if (identifiers.channelId) {
      await this.redis.sadd(
        `sessions:by-channel:${identifiers.channelId}`,
        exchangeName,
      );
    }
    if (identifiers.discordChannelId) {
      await this.redis.sadd(
        `sessions:by-channel:${identifiers.discordChannelId}`,
        exchangeName,
      );
    }

    // Thread index
    if (identifiers.threadId) {
      await this.redis.sadd(
        `sessions:by-thread:${identifiers.threadId}`,
        exchangeName,
      );
    }
    if (identifiers.discordThreadId) {
      await this.redis.sadd(
        `sessions:by-thread:${identifiers.discordThreadId}`,
        exchangeName,
      );
    }

    // Issue index
    if (identifiers.issueKey) {
      await this.redis.sadd(
        `sessions:by-issue:${identifiers.issueKey}`,
        exchangeName,
      );
    }
    if (identifiers.jiraIssueKey) {
      await this.redis.sadd(
        `sessions:by-issue:${identifiers.jiraIssueKey}`,
        exchangeName,
      );
    }

    // PR index
    if (identifiers.repoFullName && identifiers.prNumber) {
      const key = `${identifiers.repoFullName}-${identifiers.prNumber}`;
      await this.redis.sadd(`sessions:by-pr:${key}`, exchangeName);
    }

    // User index (sorted set by timestamp)
    if (userId) {
      await this.redis.zadd(
        `sessions:by-user:${userId}`,
        session.lastActivityAt,
        exchangeName,
      );
    }
  }

  /**
   * Delete lookup indexes for a session
   * @private
   */
  private async deleteIndexes(session: Session): Promise<void> {
    const { identifiers, userId } = session.context;
    const { exchangeName } = session;

    // Remove from all indexes
    if (identifiers.channelId) {
      await this.redis.srem(
        `sessions:by-channel:${identifiers.channelId}`,
        exchangeName,
      );
    }
    if (identifiers.discordChannelId) {
      await this.redis.srem(
        `sessions:by-channel:${identifiers.discordChannelId}`,
        exchangeName,
      );
    }
    if (identifiers.threadId) {
      await this.redis.srem(
        `sessions:by-thread:${identifiers.threadId}`,
        exchangeName,
      );
    }
    if (identifiers.discordThreadId) {
      await this.redis.srem(
        `sessions:by-thread:${identifiers.discordThreadId}`,
        exchangeName,
      );
    }
    if (identifiers.issueKey) {
      await this.redis.srem(
        `sessions:by-issue:${identifiers.issueKey}`,
        exchangeName,
      );
    }
    if (identifiers.jiraIssueKey) {
      await this.redis.srem(
        `sessions:by-issue:${identifiers.jiraIssueKey}`,
        exchangeName,
      );
    }
    if (identifiers.repoFullName && identifiers.prNumber) {
      const key = `${identifiers.repoFullName}-${identifiers.prNumber}`;
      await this.redis.srem(`sessions:by-pr:${key}`, exchangeName);
    }
    if (userId) {
      await this.redis.zrem(`sessions:by-user:${userId}`, exchangeName);
    }
  }

  /**
   * Close the Redis connection
   */
  async close(): Promise<void> {
    await this.redis.quit();
  }
}
