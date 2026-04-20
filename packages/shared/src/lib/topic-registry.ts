import type { KV } from "nats";
import {
  serializeTopic,
  type Topic,
  type TopicSubscription,
} from "../standards/topic";

export class TopicRegistry {
  constructor(private kv: KV) {}

  async subscribe(
    topic: Topic,
    chimpId: string,
    profile: string,
    { force = false } = {},
  ): Promise<boolean> {
    const key = serializeTopic(topic);
    const value: TopicSubscription = {
      chimpId,
      profile,
      subscribedAt: new Date().toISOString(),
    };
    if (force) {
      await this.kv.put(key, JSON.stringify(value));
      return true;
    }
    try {
      await this.kv.create(key, JSON.stringify(value));
      return true;
    } catch (err) {
      if (err instanceof Error && err.message.includes("wrong last sequence")) {
        return false;
      }
      throw err;
    }
  }

  async lookup(topic: Topic): Promise<TopicSubscription | null> {
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
      // best-effort cleanup
    }
  }

  async unsubscribeAll(chimpId: string): Promise<void> {
    const keys = await this.kv.keys();
    for await (const key of keys) {
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
        // best-effort cleanup
      }
    }
  }

  async listForChimp(chimpId: string): Promise<Topic[]> {
    const topics: Topic[] = [];
    const keys = await this.kv.keys();
    for await (const key of keys) {
      try {
        const entry = await this.kv.get(key);
        if (!entry?.value) continue;
        const sub: TopicSubscription = JSON.parse(
          new TextDecoder().decode(entry.value),
        );
        if (sub.chimpId !== chimpId) continue;
        const topic = parseTopicKey(key);
        if (topic) topics.push(topic);
      } catch {
        // skip malformed entries
      }
    }
    return topics;
  }
}

function parseTopicKey(key: string): Topic | null {
  const parts = key.split(".");
  switch (parts[0]) {
    case "github": {
      const owner = parts[1];
      const repo = parts[2];
      const type = parts[3];
      const number = parts[4];
      if (!owner || !repo || !type || !number) return null;
      if (type !== "pr" && type !== "issue") return null;
      const parsed = Number(number);
      if (Number.isNaN(parsed)) return null;
      return { platform: "github", owner, repo, type, number: parsed };
    }
    default:
      return null;
  }
}
