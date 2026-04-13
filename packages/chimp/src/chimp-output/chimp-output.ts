import type { ChimpOutputMessage } from "@mnke/circus-shared/protocol";

export abstract class ChimpOutput {
  abstract publish(message: ChimpOutputMessage): void;
}
