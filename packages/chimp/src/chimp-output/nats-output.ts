import { Standards } from "@mnke/circus-shared";
import type { ChimpOutputMessage } from "@mnke/circus-shared/protocol";
import type { NatsConnection } from "nats";
import { ChimpOutput } from "./chimp-output";

export class NatsOutput extends ChimpOutput {
  private nc: NatsConnection;
  private outputSubject: string;

  constructor(nc: NatsConnection, chimpId: string) {
    super();
    this.nc = nc;
    this.outputSubject = Standards.Chimp.Naming.outputSubject(chimpId);
  }

  publish(message: ChimpOutputMessage): void {
    this.nc.publish(this.outputSubject, JSON.stringify(message));
  }
}
