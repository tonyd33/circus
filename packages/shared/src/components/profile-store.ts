import type Redis from "ioredis";
import type { ChimpProfile } from "../protocol";
import { Naming } from "../standards/chimp";

export class ProfileStore {
  constructor(private redis: Redis) {}

  async get(name: string): Promise<ChimpProfile | null> {
    const data = await this.redis.get(Naming.redisProfileKey(name));
    if (!data) return null;
    return JSON.parse(data) as ChimpProfile;
  }

  async save(name: string, profile: ChimpProfile): Promise<void> {
    await this.redis.set(Naming.redisProfileKey(name), JSON.stringify(profile));
  }

  async delete(name: string): Promise<boolean> {
    const deleted = await this.redis.del(Naming.redisProfileKey(name));
    return deleted > 0;
  }

  async list(): Promise<Record<string, ChimpProfile>> {
    const keys = await this.redis.keys(Naming.redisProfilePattern());
    if (keys.length === 0) return {};

    const pipeline = this.redis.pipeline();
    for (const key of keys) {
      pipeline.get(key);
    }
    const results = await pipeline.exec();
    if (!results) return {};

    const profiles: Record<string, ChimpProfile> = {};
    for (let i = 0; i < keys.length; i++) {
      const [err, data] = results[i] ?? [];
      if (!err && data) {
        const name = keys[i]?.replace("profile:", "");
        if (name) {
          profiles[name] = JSON.parse(data as string) as ChimpProfile;
        }
      }
    }
    return profiles;
  }

  async seedDefaults(defaults: Record<string, ChimpProfile>): Promise<boolean> {
    const keys = await this.redis.keys(Naming.redisProfilePattern());
    if (keys.length > 0) return false;

    const pipeline = this.redis.pipeline();
    for (const [name, profile] of Object.entries(defaults)) {
      pipeline.set(Naming.redisProfileKey(name), JSON.stringify(profile));
    }
    await pipeline.exec();
    return true;
  }
}
