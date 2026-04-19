import { type Logger, Protocol, Standards } from "@mnke/circus-shared";
import Redis from "ioredis";

const Naming = Standards.Chimp.Naming;

const DEFAULT_PROFILE: Protocol.ChimpProfile = {
  brain: "echo",
  model: "haiku-4-5",
  image: "chimp",
  extraEnv: [],
  volumeMounts: [],
  volumes: [],
  initCommands: [],
};

export class ProfileLoader {
  private redis: Redis;
  private logger: Logger.Logger;

  constructor(redisUrl: string, logger: Logger.Logger) {
    this.redis = new Redis(redisUrl);
    this.logger = logger;
  }

  async seedDefaults(): Promise<void> {
    const keys = await this.redis.keys(Naming.redisProfilePattern());
    if (keys.length > 0) return;

    const key = Naming.redisProfileKey("default");
    await this.redis.set(key, JSON.stringify(DEFAULT_PROFILE));
    this.logger.info("Seeded default profile");
  }

  async getProfile(name: string): Promise<Protocol.ChimpProfile> {
    const key = Naming.redisProfileKey(name);
    const data = await this.redis.get(key);
    if (!data) {
      throw new Error(`Profile "${name}" not found`);
    }
    return Protocol.ChimpProfileSchema.parse(JSON.parse(data));
  }

  async stop(): Promise<void> {
    await this.redis.quit();
  }
}
