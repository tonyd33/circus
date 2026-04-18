/**
 * Ringmaster - Meta Event Publisher
 *
 * Publishes meta events to NATS for Chimp lifecycle monitoring
 */

import { Logger, type Protocol, Standards } from "@mnke/circus-shared";
import type { NatsConnection } from "nats";

const logger = Logger.createLogger("MetaPublisher");

export class MetaPublisher {
  private nc: NatsConnection;

  constructor(nc: NatsConnection) {
    this.nc = nc;
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
    logger.info({ subject, chimpId, profile }, "Published spawned meta event");
  }
}
