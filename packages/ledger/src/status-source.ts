/**
 * Ledger - Status Source
 *
 * Reads chimp status from Redis
 */

import { createLogger } from "@mnke/circus-shared/logger";
import type { ChimpState } from "@mnke/circus-shared/standards/chimp";
import { Naming } from "@mnke/circus-shared/standards/chimp";

import type Redis from "ioredis";

const logger = createLogger("RedisStatusSource");

export class RedisStatusSource {
  constructor(private redis: Redis) {}

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

  async get(chimpId: string): Promise<ChimpState | null> {
    const key = Naming.redisChimpKey(chimpId);
    const data = await this.redis.get(key);
    if (!data) return null;
    return JSON.parse(data) as ChimpState;
  }
}
