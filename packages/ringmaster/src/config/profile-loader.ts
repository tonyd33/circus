import { type Logger, Protocol, Standards } from "@mnke/circus-shared";
import Redis from "ioredis";

const Naming = Standards.Chimp.Naming;

const DEFAULT_PROFILES: Record<string, Protocol.ChimpProfile> = {
  scout: {
    brain: "claude",
    model: "claude-haiku-4-5-20251001",
    image: "chimp",
    description:
      "Fast triage and simple tasks. Good for initial assessment, small fixes, and deciding if work needs a more powerful profile.",
    extraEnv: [],
    volumeMounts: [],
    volumes: [],
    initCommands: [],
  },
  worker: {
    brain: "claude",
    model: "claude-sonnet-4-20250514",
    image: "chimp",
    description:
      "General-purpose coding agent. Handles most tasks — bug fixes, feature implementation, code review.",
    extraEnv: [],
    volumeMounts: [],
    volumes: [],
    initCommands: [],
  },
  architect: {
    brain: "claude",
    model: "claude-opus-4-20250514",
    image: "chimp",
    description:
      "Deep reasoning and complex refactors. Use for architectural changes, multi-file rewrites, or when worker gets stuck.",
    extraEnv: [],
    volumeMounts: [],
    volumes: [],
    initCommands: [],
  },
  "opencode-worker": {
    brain: "opencode",
    model: "anthropic:claude-sonnet-4-20250514",
    image: "chimp",
    description:
      "General-purpose via OpenCode. Alternative runtime for tasks that benefit from OpenCode's tooling.",
    extraEnv: [],
    volumeMounts: [],
    volumes: [],
    initCommands: [],
  },
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

    const pipeline = this.redis.pipeline();
    for (const [name, profile] of Object.entries(DEFAULT_PROFILES)) {
      pipeline.set(Naming.redisProfileKey(name), JSON.stringify(profile));
    }
    await pipeline.exec();
    this.logger.info(
      { profiles: Object.keys(DEFAULT_PROFILES) },
      "Seeded default profiles",
    );
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
