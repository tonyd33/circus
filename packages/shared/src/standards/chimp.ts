import { z } from "zod";

export const ChimpIdSchema = z.string().min(1);

export const Env = {
  chimpId: "CHIMP_ID",
  natsUrl: "NATS_URL",
  redisUrl: "REDIS_URL",
  databaseUrl: "DATABASE_URL",
  brainType: "CHIMP_BRAIN_TYPE",
  provider: "CHIMP_PROVIDER",
  model: "CHIMP_MODEL",
  profile: "CHIMP_PROFILE",
  inputMode: "CHIMP_INPUT_MODE",
  outputMode: "CHIMP_OUTPUT_MODE",
  httpPort: "CHIMP_HTTP_PORT",
};

export const Prefix = {
  EVENTS: "events",
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
    return `${Prefix.EVENTS}.direct.${chimpId}.command`;
  },
  outputSubject(chimpId: string): string {
    return `${Prefix.OUTPUTS}.${chimpId}`;
  },
  lifecycleSubject(chimpId: string): string {
    return `${Prefix.META}.lifecycle.${chimpId}`;
  },
  lifecycleFilter(): string {
    return `${Prefix.META}.lifecycle.>`;
  },
  orchestrationStreamName(): string {
    return "orchestration";
  },
  orchestrationSubject(action: string, chimpId: string): string {
    return `${Prefix.META}.orchestration.${action}.${chimpId}`;
  },
  orchestrationFilter(): string {
    return `${Prefix.META}.orchestration.>`;
  },

  eventConsumerName(chimpId: string): string {
    return `chimp-${chimpId}`;
  },
  orchestrationConsumerName(): string {
    return "ringmaster-orchestration";
  },
  podName(chimpId: string): string {
    const hash = Bun.hash(chimpId).toString(36);
    return `chimp-${hash}`;
  },
};
