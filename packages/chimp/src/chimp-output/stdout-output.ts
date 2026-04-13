import type { ChimpOutputMessage } from "@mnke/circus-shared/protocol";
import { ChimpOutput } from "./chimp-output";

export class StdoutOutput extends ChimpOutput {
  publish(message: ChimpOutputMessage): void {
    console.log(JSON.stringify(message));
  }
}
