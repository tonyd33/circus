export const Env = {
  chimpId: "CHIMP_ID",
  natsUrl: "NATS_URL",
  redisUrl: "REDIS_URL",
  databaseUrl: "DATABASE_URL",
  brainType: "CHIMP_BRAIN_TYPE",
  model: "CHIMP_MODEL",
  profile: "CHIMP_PROFILE",
  inputMode: "CHIMP_INPUT_MODE",
  outputMode: "CHIMP_OUTPUT_MODE",
  httpPort: "CHIMP_HTTP_PORT",
};

export const DEFAULT_PROFILE = "scout";

export const Prefix = {
  EVENTS: "events",
  DIRECT: "events.direct",
  OUTPUTS: "outputs",
  META: "meta",
};

export type ChimpStatus =
  | "scheduled"
  | "pending"
  | "running"
  | "stopped"
  | "failed"
  | "unknown";

export interface ChimpState {
  chimpId: string;
  profile: string;
  status: ChimpStatus;
  createdAt: number;
  updatedAt: number;
}

export const Naming = {
  eventsStreamName(): string {
    return "events";
  },
  outputsStreamName(): string {
    return "outputs";
  },

  directSubject(chimpId: string): string {
    return `${Prefix.DIRECT}.${chimpId}`;
  },
  outputSubject(chimpId: string): string {
    return `${Prefix.OUTPUTS}.${chimpId}`;
  },
  metaSubject(chimpId: string): string {
    return `${Prefix.META}.${chimpId}`;
  },

  eventConsumerName(chimpId: string): string {
    return `chimp-${chimpId}`;
  },
  podName(chimpId: string): string {
    const hash = Bun.hash(chimpId).toString(36);
    return `chimp-${hash}`;
  },

  redisChimpKey(chimpId: string): string {
    return `chimp:${chimpId}:state`;
  },
  redisChimpPattern(): string {
    return "chimp:*:state";
  },
  redisProfileKey(name: string): string {
    return `profile:${name}`;
  },
  redisProfilePattern(): string {
    return "profile:*";
  },
};
