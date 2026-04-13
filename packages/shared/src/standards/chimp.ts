export const Env = {
  chimpId: "CHIMP_ID",
  natsUrl: "NATS_URL",
  brainType: "CHIMP_BRAIN_TYPE",
  initConfig: "CHIMP_INIT_CONFIG",
  inputMode: "CHIMP_INPUT_MODE",
  outputMode: "CHIMP_OUTPUT_MODE",
  httpPort: "CHIMP_HTTP_PORT",
};
export const Prefix = {
  INPUTS: "chimps.inputs",
  OUTPUTS: "chimps.outputs",
};

export type ChimpStatus =
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
  inputStreamName(): string {
    return "chimps-inputs";
  },
  outputStreamName(): string {
    return "chimps-outputs";
  },
  inputSubject(chimpId: string): string {
    return `chimps.inputs.${chimpId}`;
  },
  outputSubject(chimpId: string): string {
    return `chimps.outputs.${chimpId}`;
  },
  parseInputSubject(subject: string): string | null {
    const prefix = "chimps.inputs.";
    if (!subject.startsWith(prefix)) return null;
    const chimpId = subject.slice(prefix.length);
    return chimpId || null;
  },
  parseOutputSubject(subject: string): string | null {
    const prefix = "chimps.outputs.";
    if (!subject.startsWith(prefix)) return null;
    const chimpId = subject.slice(prefix.length);
    return chimpId || null;
  },
  podName(chimpId: string): string {
    return `chimp-${chimpId.toLowerCase()}`;
  },
  redisChimpKey(chimpId: string): string {
    return `chimp:${chimpId}:state`;
  },
  redisChimpPattern(): string {
    return "chimp:*:state";
  },
};
