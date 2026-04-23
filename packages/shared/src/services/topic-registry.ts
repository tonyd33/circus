import { and, eq } from "drizzle-orm";
import type { JetStreamManager, NatsConnection } from "nats";
import type { Database } from "../db/client";
import { topicSubscriptions } from "../db/schema";
import { Naming } from "../standards/chimp";
import {
  eventSubjectToTopic,
  serializeTopic,
  type Topic,
  type TopicSubscription,
  topicToEventSubject,
} from "../standards/topic";

export class TopicRegistry {
  private jsm: JetStreamManager | null = null;

  constructor(
    private nc: NatsConnection,
    private db: Database,
  ) {}

  async start(): Promise<void> {
    this.jsm = await this.nc.jetstreamManager();
  }

  async subscribe(topic: Topic, chimpId: string): Promise<void> {
    if (!this.jsm) throw new Error("TopicRegistry not started");

    const key = serializeTopic(topic);

    await this.db
      .insert(topicSubscriptions)
      .values({ topicKey: key, chimpId })
      .onConflictDoNothing();

    const filterSubject = topicToEventSubject(topic);
    const streamName = Naming.eventsStreamName();
    const consumerName = Naming.eventConsumerName(chimpId);

    try {
      const info = await this.jsm.consumers.info(streamName, consumerName);
      const existing = info.config.filter_subjects ?? [];
      if (!existing.includes(filterSubject)) {
        await this.jsm.consumers.update(streamName, consumerName, {
          filter_subjects: [...existing, filterSubject],
        });
      }
    } catch {
      // Consumer may not exist yet
    }
  }

  async lookup(topic: Topic): Promise<TopicSubscription[]> {
    const key = serializeTopic(topic);
    const rows = await this.db
      .select()
      .from(topicSubscriptions)
      .where(eq(topicSubscriptions.topicKey, key));

    return rows.map((r) => ({
      chimpId: r.chimpId,
      subscribedAt: r.subscribedAt.toISOString(),
    }));
  }

  async unsubscribe(topic: Topic, chimpId: string): Promise<void> {
    const key = serializeTopic(topic);
    await this.db
      .delete(topicSubscriptions)
      .where(
        and(
          eq(topicSubscriptions.topicKey, key),
          eq(topicSubscriptions.chimpId, chimpId),
        ),
      );
  }

  async unsubscribeAll(chimpId: string): Promise<void> {
    await this.db
      .delete(topicSubscriptions)
      .where(eq(topicSubscriptions.chimpId, chimpId));
  }

  async listForChimp(chimpId: string): Promise<Topic[]> {
    if (!this.jsm) return [];

    const streamName = Naming.eventsStreamName();
    const consumerName = Naming.eventConsumerName(chimpId);

    try {
      const info = await this.jsm.consumers.info(streamName, consumerName);
      const filterSubjects = info.config.filter_subjects ?? [];
      return filterSubjects
        .map((s) => eventSubjectToTopic(s))
        .filter((t): t is Topic => t !== null);
    } catch {
      return [];
    }
  }
}
