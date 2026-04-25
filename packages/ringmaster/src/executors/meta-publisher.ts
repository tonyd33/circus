import { type Protocol, Standards } from "@mnke/circus-shared";
import type * as Logger from "@mnke/circus-shared/logger";
import type { NatsConnection } from "nats";

export class MetaPublisher {
  private nc: NatsConnection;
  private logger: Logger.Logger;

  constructor(nc: NatsConnection, logger: Logger.Logger) {
    this.nc = nc;
    this.logger = logger;
  }

  async publishStatus(
    chimpId: string,
    status: Standards.Chimp.ChimpStatus,
  ): Promise<void> {
    const event: Protocol.MetaEvent = {
      type: "status",
      timestamp: new Date().toISOString(),
      chimpId,
      status,
    };
    const subject = Standards.Chimp.Naming.metaSubject(chimpId);
    this.nc.publish(subject, JSON.stringify(event));
    this.logger.info(
      { subject, chimpId, status },
      "Published status meta event",
    );
  }
}
