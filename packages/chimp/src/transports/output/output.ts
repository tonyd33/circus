import type { Protocol } from "@mnke/circus-shared";

export abstract class ChimpOutput {
  abstract publish(message: Protocol.ChimpOutputMessage): void;
}
