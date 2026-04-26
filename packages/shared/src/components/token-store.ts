import type Redis from "ioredis";

export interface TokenStore {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlSec?: number): Promise<void>;
}

export class RedisTokenStore implements TokenStore {
  constructor(private redis: Redis) {}

  async get(key: string): Promise<string | null> {
    const value = await this.redis.get(key);
    return value;
  }

  async set(key: string, value: string, ttlSec?: number): Promise<void> {
    if (ttlSec != null) {
      await this.redis.setex(key, ttlSec, value);
    } else {
      await this.redis.set(key, value);
    }
  }
}
