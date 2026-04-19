import type { Protocol } from "@mnke/circus-shared";
import { ChimpOutput } from "./output";

export class StdoutOutput extends ChimpOutput {
  publish(message: Protocol.ChimpOutputMessage): void {
    console.log(JSON.stringify(message));
  }
}
