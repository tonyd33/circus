/**
 * Ringmaster - Redis Manager
 *
 * Manages chimp state in Redis
 */

import { Standards } from "@mnke/circus-shared";
import type * as Logger from "@mnke/circus-shared/logger";
import Redis from "ioredis";

type ChimpState = Standards.Chimp.ChimpState;
type ChimpStatus = Standards.Chimp.ChimpStatus;
const Naming = Standards.Chimp.Naming;

export class StateManager {
  private redis: Redis;
  private logger: Logger.Logger;

  constructor(redisUrl: string, logger: Logger.Logger) {
    this.redis = new Redis(redisUrl);
    this.logger = logger;
  }

  async start(): Promise<void> {
    await this.redis.ping();
  }

  async stop(): Promise<void> {
    await this.redis.quit();
  }

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
    this.logger.debug({ chimpId, status }, "Upserted chimp state");
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
    this.logger.debug({ chimpId }, "Deleted chimp state");
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
