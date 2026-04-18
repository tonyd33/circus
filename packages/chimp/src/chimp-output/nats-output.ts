import { type Protocol, Standards } from "@mnke/circus-shared";
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

  publish(message: Protocol.ChimpOutputMessage): void {
    this.nc.publish(this.outputSubject, JSON.stringify(message));
  }
}
