export const Env = {
  chimpId: "CHIMP_ID",
  natsUrl: "NATS_URL",
  brainType: "CHIMP_BRAIN_TYPE",
  model: "CHIMP_MODEL",
  initConfig: "CHIMP_INIT_CONFIG",
  inputMode: "CHIMP_INPUT_MODE",
  outputMode: "CHIMP_OUTPUT_MODE",
  httpPort: "CHIMP_HTTP_PORT",
};
export const Prefix = {
  INPUTS: "chimps.inputs",
  OUTPUTS: "chimps.outputs",
  // New topology (without 's')
  CHIMP: "chimp",
  CHIMP_INPUTS: "chimp.inputs",
  CHIMP_OUTPUTS: "chimp.outputs",
  CHIMP_META: "chimp.meta",
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
  parseInputSubject(
    subject: string,
  ): { profile: string; chimpId: string } | null {
    // Support both old topology (chimps.inputs.{id}) and new (chimp.inputs.{profile}.{id})
    const oldPrefix = "chimps.inputs.";
    const newPrefix = "chimp.inputs.";

    if (subject.startsWith(newPrefix)) {
      // New format: chimp.inputs.{profile}.{chimpId}
      const rest = subject.slice(newPrefix.length);
      const dotIndex = rest.indexOf(".");
      if (dotIndex === -1) return null;
      const profile = rest.slice(0, dotIndex);
      const chimpId = rest.slice(dotIndex + 1);
      return profile && chimpId ? { profile, chimpId } : null;
    }

    if (subject.startsWith(oldPrefix)) {
      // Old format: chimps.inputs.{chimpId} - treat entire as chimpId
      const chimpId = subject.slice(oldPrefix.length);
      return chimpId ? { profile: "", chimpId } : null;
    }

    return null;
  },
  parseOutputSubject(
    subject: string,
  ): { profile: string; chimpId: string } | null {
    // Support both old topology (chimps.outputs.{id}) and new (chimp.outputs.{profile}.{chimpId})
    const oldPrefix = "chimps.outputs.";
    const newPrefix = "chimp.outputs.";

    if (subject.startsWith(newPrefix)) {
      // New format: chimp.outputs.{profile}.{chimpId}
      const rest = subject.slice(newPrefix.length);
      const dotIndex = rest.indexOf(".");
      if (dotIndex === -1) return null;
      const profile = rest.slice(0, dotIndex);
      const chimpId = rest.slice(dotIndex + 1);
      return profile && chimpId ? { profile, chimpId } : null;
    }

    if (subject.startsWith(oldPrefix)) {
      // Old format: chimps.outputs.{chimpId} - treat entire as chimpId
      const chimpId = subject.slice(oldPrefix.length);
      return chimpId ? { profile: "", chimpId } : null;
    }

    return null;
  },

  metaSubject(profile: string, chimpId: string): string {
    return `chimp.meta.${profile}.${chimpId}`;
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
