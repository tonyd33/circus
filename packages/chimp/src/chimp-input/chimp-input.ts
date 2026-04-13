import type { ChimpCommand } from "@mnke/circus-shared/protocol";

export type MessageHandler = (
  command: ChimpCommand,
) => Promise<"continue" | "stop">;

export type ActivityCallback = () => void;

export abstract class ChimpInput {
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
}
