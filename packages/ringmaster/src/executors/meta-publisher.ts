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

  async publishSpawned(profile: string, chimpId: string): Promise<void> {
    const event: Protocol.MetaEvent = {
      type: "spawned",
      timestamp: new Date().toISOString(),
      profile,
      chimpId,
    };
    const subject = Standards.Chimp.Naming.metaSubject(profile, chimpId);
    const payload = JSON.stringify(event);
    this.nc.publish(subject, payload);
    this.logger.info(
      { subject, chimpId, profile },
      "Published spawned meta event",
    );
  }
}
