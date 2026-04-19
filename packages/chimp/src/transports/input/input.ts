import type { Protocol } from "@mnke/circus-shared";

export type MessageHandler = (
  command: Protocol.ChimpCommand,
) => Promise<"continue" | "stop">;

export type ActivityCallback = () => void;

export abstract class ChimpInput {
  abstract start(): Promise<void>;
  abstract stop(): Promise<void>;
}
