/**
 * Ringmaster - Redis Manager
 *
 * Manages chimp state in Redis
 */

import { createLogger } from "@mnke/circus-shared/logger";
import type {
  ChimpState,
  ChimpStatus,
} from "@mnke/circus-shared/standards/chimp";
import { Naming } from "@mnke/circus-shared/standards/chimp";
import type Redis from "ioredis";

const logger = createLogger("RedisManager");

export class RedisManager {
  constructor(private redis: Redis) {}

  async upsert(chimpId: string, status: ChimpStatus): Promise<void> {
    const key = Naming.redisChimpKey(chimpId);
    const now = Date.now();

    const existing = await this.redis.get(key);
    let createdAt = now;
    if (existing) {
      const parsed = JSON.parse(existing) as ChimpState;
      createdAt = parsed.createdAt;
    }

    const state: ChimpState = {
      chimpId,
      status,
      createdAt,
      updatedAt: now,
    };

    await this.redis.set(key, JSON.stringify(state));
    logger.debug({ chimpId, status }, "Upserted chimp state");
  }

  async get(chimpId: string): Promise<ChimpState | null> {
    const key = Naming.redisChimpKey(chimpId);
    const data = await this.redis.get(key);
    if (!data) return null;
    return JSON.parse(data) as ChimpState;
  }

  async delete(chimpId: string): Promise<void> {
    const key = Naming.redisChimpKey(chimpId);
    await this.redis.del(key);
    logger.debug({ chimpId }, "Deleted chimp state");
  }

  async list(): Promise<ChimpState[]> {
    const pattern = Naming.redisChimpPattern();
    const keys = await this.redis.keys(pattern);
    if (keys.length === 0) return [];

    const pipeline = this.redis.pipeline();
    for (const key of keys) {
      pipeline.get(key);
    }

    const results = await pipeline.exec();
    if (!results) return [];

    const states: ChimpState[] = [];
    for (const [err, data] of results) {
      if (!err && data) {
        states.push(JSON.parse(data as string) as ChimpState);
      }
    }
    return states;
  }
}
