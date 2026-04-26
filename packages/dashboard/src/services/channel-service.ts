import type { TopicRegistry } from "@mnke/circus-shared/components";

export interface ChannelInfo {
  channelId: string;
  subscriberCount: number;
}

export class ChannelService {
  constructor(private topicRegistry: TopicRegistry) {}

  async listChannels(): Promise<ChannelInfo[]> {
    const all = await this.topicRegistry.listAll();
    const channelMap = new Map<string, number>();

    for (const [_chimpId, topics] of Object.entries(all)) {
      for (const topic of topics) {
        if (topic.platform === "channel") {
          channelMap.set(
            topic.channelId,
            (channelMap.get(topic.channelId) ?? 0) + 1,
          );
        }
      }
    }

    return Array.from(channelMap.entries())
      .map(([channelId, subscriberCount]) => ({
        channelId,
        subscriberCount,
      }))
      .sort((a, b) => a.channelId.localeCompare(b.channelId));
  }
}
