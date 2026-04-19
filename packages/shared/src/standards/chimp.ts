import * as P from "../lib/parser/string";

export const Env = {
  chimpId: "CHIMP_ID",
  natsUrl: "NATS_URL",
  brainType: "CHIMP_BRAIN_TYPE",
  model: "CHIMP_MODEL",
  profile: "CHIMP_PROFILE",
  initConfig: "CHIMP_INIT_CONFIG",
  inputMode: "CHIMP_INPUT_MODE",
  outputMode: "CHIMP_OUTPUT_MODE",
  httpPort: "CHIMP_HTTP_PORT",
};

export const Prefix = {
  INPUTS: "chimp.inputs",
  OUTPUTS: "chimp.outputs",
  META: "chimp.meta",
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

const segment = P.flat(P.many1(P.noneOf(".")));

function subjectParser(prefix: string) {
  return P.Do()
    .do(P.str(prefix))
    .do(P.grapheme("."))
    .bind("profile", segment)
    .do(P.grapheme("."))
    .bind("chimpId", segment)
    .return((env) => env);
}

function parseSubject(
  prefix: string,
  subject: string,
): { profile: string; chimpId: string } | null {
  const result = subjectParser(prefix).parse(subject);
  return result.unwrapOr(null);
}

export const Naming = {
  inputStreamName(): string {
    return "chimp-inputs";
  },
  outputStreamName(): string {
    return "chimp-outputs";
  },
  inputSubject(profile: string, chimpId: string): string {
    return `${Prefix.INPUTS}.${profile}.${chimpId}`;
  },
  outputSubject(profile: string, chimpId: string): string {
    return `${Prefix.OUTPUTS}.${profile}.${chimpId}`;
  },
  metaSubject(profile: string, chimpId: string): string {
    return `${Prefix.META}.${profile}.${chimpId}`;
  },
  parseInputSubject(
    subject: string,
  ): { profile: string; chimpId: string } | null {
    return parseSubject(Prefix.INPUTS, subject);
  },
  parseOutputSubject(
    subject: string,
  ): { profile: string; chimpId: string } | null {
    return parseSubject(Prefix.OUTPUTS, subject);
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
