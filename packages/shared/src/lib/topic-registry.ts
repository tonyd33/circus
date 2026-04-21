import type { JetStreamManager, KV, NatsConnection } from "nats";
import { Naming } from "../standards/chimp";
import {
  eventSubjectToTopic,
  serializeTopic,
  TOPIC_OWNERS_BUCKET,
  type Topic,
  type TopicSubscription,
  topicToEventSubject,
} from "../standards/topic";

export class TopicRegistry {
  private kv: KV | null = null;
  private jsm: JetStreamManager | null = null;

  constructor(private nc: NatsConnection) {}

  async start(): Promise<void> {
    const js = this.nc.jetstream();
    this.jsm = await this.nc.jetstreamManager();
    this.kv = await js.views.kv(TOPIC_OWNERS_BUCKET, { history: 1 });
  }

  async subscribe(
    topic: Topic,
    chimpId: string,
    { force = false } = {},
  ): Promise<boolean> {
    if (!this.kv || !this.jsm) throw new Error("TopicRegistry not started");

    const key = serializeTopic(topic);
    const value: TopicSubscription = {
      chimpId,
      subscribedAt: new Date().toISOString(),
    };

    if (force) {
      await this.kv.put(key, JSON.stringify(value));
    } else {
      try {
        await this.kv.create(key, JSON.stringify(value));
      } catch (err) {
        if (
          err instanceof Error &&
          err.message.includes("wrong last sequence")
        ) {
          return false;
        }
        throw err;
      }
    }

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

    return true;
  }

  async lookup(topic: Topic): Promise<TopicSubscription | null> {
    if (!this.kv) throw new Error("TopicRegistry not started");

    const key = serializeTopic(topic);
    try {
      const entry = await this.kv.get(key);
      if (!entry?.value) return null;
      return JSON.parse(new TextDecoder().decode(entry.value));
    } catch {
      return null;
    }
  }

  async unsubscribe(topic: Topic, chimpId: string): Promise<void> {
    if (!this.kv) return;

    const key = serializeTopic(topic);
    try {
      const entry = await this.kv.get(key);
      if (!entry?.value) return;
      const sub: TopicSubscription = JSON.parse(
        new TextDecoder().decode(entry.value),
      );
      if (sub.chimpId === chimpId) {
        await this.kv.delete(key);
      }
    } catch {
      // best-effort
    }
  }

  async unsubscribeAll(chimpId: string): Promise<void> {
    if (!this.kv) return;

    const allKeys: string[] = [];
    const keys = await this.kv.keys();
    for await (const key of keys) {
      allKeys.push(key);
    }
    for (const key of allKeys) {
      try {
        const entry = await this.kv.get(key);
        if (!entry?.value) continue;
        const sub: TopicSubscription = JSON.parse(
          new TextDecoder().decode(entry.value),
        );
        if (sub.chimpId === chimpId) {
          await this.kv.delete(key);
        }
      } catch {
        // best-effort
      }
    }
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
