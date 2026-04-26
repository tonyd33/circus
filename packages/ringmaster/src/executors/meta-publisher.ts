import { type Protocol, Standards } from "@mnke/circus-shared";
import type * as Logger from "@mnke/circus-shared/logger";
import type { NatsConnection } from "nats";

type Topic = Standards.Topic.Topic;

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
    this.publish(chimpId, event);
    this.logger.info(
      { subject: Standards.Chimp.Naming.metaSubject(chimpId), chimpId, status },
      "Published status meta event",
    );
  }

  async publishProfile(chimpId: string, profile: string): Promise<void> {
    const event: Protocol.MetaEvent = {
      type: "profile",
      timestamp: new Date().toISOString(),
      chimpId,
      profile,
    };
    this.publish(chimpId, event);
    this.logger.info({ chimpId, profile }, "Published profile meta event");
  }

  async publishTopics(chimpId: string, topics: Topic[]): Promise<void> {
    const event: Protocol.MetaEvent = {
      type: "topics",
      timestamp: new Date().toISOString(),
      chimpId,
      topics,
    };
    this.publish(chimpId, event);
    this.logger.info(
      { chimpId, topicCount: topics.length },
      "Published topics meta event",
    );
  }

  private publish(chimpId: string, event: Protocol.MetaEvent): void {
    const subject = Standards.Chimp.Naming.metaSubject(chimpId);
    this.nc.publish(subject, JSON.stringify(event));
  }
}
