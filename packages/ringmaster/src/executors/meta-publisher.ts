/**
 * Ringmaster - Meta Event Publisher
 *
 * Publishes meta events to NATS for Chimp lifecycle monitoring
 */

import { type Logger, type Protocol, Standards } from "@mnke/circus-shared";
import type { NatsConnection } from "nats";

export class MetaPublisher {
  private nc: NatsConnection;
  private logger: Logger.Logger;

  constructor(nc: NatsConnection, logger: Logger.Logger) {
    this.nc = nc;
    this.logger = logger;
  }

  async publishStatus(
    profile: string,
    chimpId: string,
    status: Standards.Chimp.ChimpStatus,
  ): Promise<void> {
    const event: Protocol.MetaEvent = {
      type: "status",
      timestamp: new Date().toISOString(),
      profile,
      chimpId,
      status,
    };
    const subject = Standards.Chimp.Naming.metaSubject(profile, chimpId);
    this.nc.publish(subject, JSON.stringify(event));
    this.logger.info(
      { subject, chimpId, profile, status },
      "Published status meta event",
    );
  }
}
