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

/**
 * Separator between topic key and chimpId in composite KV keys.
 * Chosen to avoid collisions with dots used in topic serialization.
 */
const KEY_SEPARATOR = "::";

function compositeKey(topicKey: string, chimpId: string): string {
  return `${topicKey}${KEY_SEPARATOR}${chimpId}`;
}

export class TopicRegistry {
  private kv: KV | null = null;
  private jsm: JetStreamManager | null = null;

  constructor(private nc: NatsConnection) {}

  async start(): Promise<void> {
    const js = this.nc.jetstream();
    this.jsm = await this.nc.jetstreamManager();
    this.kv = await js.views.kv(TOPIC_OWNERS_BUCKET, { history: 1 });
  }

  async subscribe(topic: Topic, chimpId: string): Promise<boolean> {
    if (!this.kv || !this.jsm) throw new Error("TopicRegistry not started");

    const topicKey = serializeTopic(topic);
    const key = compositeKey(topicKey, chimpId);
    const value: TopicSubscription = {
      chimpId,
      subscribedAt: new Date().toISOString(),
    };

    await this.kv.put(key, JSON.stringify(value));

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

  /**
   * Return the first subscriber for a topic, or null if unowned.
   * Used by the event listener for backwards-compatible routing.
   */
  async lookup(topic: Topic): Promise<TopicSubscription | null> {
    const subs = await this.lookupAll(topic);
    const first = subs[0];
    return first !== undefined ? first : null;
  }

  /**
   * Return all chimps subscribed to a topic.
   */
  async lookupAll(topic: Topic): Promise<TopicSubscription[]> {
    if (!this.kv) throw new Error("TopicRegistry not started");

    const topicKey = serializeTopic(topic);
    const prefix = `${topicKey}${KEY_SEPARATOR}`;
    const results: TopicSubscription[] = [];

    const allKeys: string[] = [];
    const keys = await this.kv.keys();
    for await (const key of keys) {
      allKeys.push(key);
    }

    for (const key of allKeys) {
      if (!key.startsWith(prefix)) continue;
      try {
        const entry = await this.kv.get(key);
        if (!entry?.value) continue;
        const sub: TopicSubscription = JSON.parse(
          new TextDecoder().decode(entry.value),
        );
        results.push(sub);
      } catch {
        // best-effort
      }
    }

    return results;
  }

  async unsubscribe(topic: Topic, chimpId: string): Promise<void> {
    if (!this.kv) return;

    const topicKey = serializeTopic(topic);
    const key = compositeKey(topicKey, chimpId);
    try {
      await this.kv.delete(key);
    } catch {
      // best-effort
    }
  }

  async unsubscribeAll(chimpId: string): Promise<void> {
    if (!this.kv) return;

    const suffix = `${KEY_SEPARATOR}${chimpId}`;
    const allKeys: string[] = [];
    const keys = await this.kv.keys();
    for await (const key of keys) {
      allKeys.push(key);
    }
    for (const key of allKeys) {
      if (!key.endsWith(suffix)) {
        // Fallback: check the value for legacy single-owner keys
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
        continue;
      }
      try {
        await this.kv.delete(key);
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
