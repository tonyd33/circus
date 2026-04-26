import { Protocol, Standards } from "@mnke/circus-shared";
import type {
  ChimpProfileStore,
  TopicRegistry,
} from "@mnke/circus-shared/components";
import type * as Logger from "@mnke/circus-shared/logger";
import type { NatsConnection } from "nats";
import type { RedisStatusSource } from "../lib/status-source";

const PING_INTERVAL_MS = 3_000;

export class ChimpService {
  constructor(
    private statusSource: RedisStatusSource,
    private chimpProfileStore: ChimpProfileStore,
    private topicRegistry: TopicRegistry,
    private nc: NatsConnection,
    private logger: Logger.Logger,
  ) {}

  async listChimps() {
    const chimps = await this.statusSource.list();
    return Promise.all(
      chimps.map(async (chimp) => ({
        ...chimp,
        profile: await this.chimpProfileStore.getProfile(chimp.chimpId),
      })),
    );
  }

  async getChimpStatus(chimpId: string) {
    return this.statusSource.get(chimpId);
  }

  async listAllTopics() {
    return this.topicRegistry.listAll();
  }

  async listChimpTopics(chimpId: string) {
    return this.topicRegistry.listForChimp(chimpId);
  }

  createLiveStream(): ReadableStream<Uint8Array> {
    const encoder = new TextEncoder();
    const nc = this.nc;
    const log = this.logger;
    const self = this;

    const sub = nc.subscribe(`${Standards.Chimp.Prefix.META}.>`);
    let pingInterval: ReturnType<typeof setInterval>;

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        try {
          const chimps = await self.listChimps();
          controller.enqueue(
            encoder.encode(
              `event: init\ndata: ${JSON.stringify({ chimps })}\n\n`,
            ),
          );
        } catch (e) {
          log.error({ err: e }, "Failed to fetch initial chimps");
          controller.error(e);
          return;
        }

        pingInterval = setInterval(() => {
          controller.enqueue(encoder.encode(":ping\n\n"));
        }, PING_INTERVAL_MS);

        (async () => {
          try {
            for await (const msg of sub) {
              const raw = msg.json();
              const parsed = Protocol.MetaEventSchema.safeParse(raw);
              if (!parsed.success) continue;

              const event = parsed.data;
              if (event.type !== "status") continue;

              controller.enqueue(
                encoder.encode(
                  `event: status\ndata: ${JSON.stringify({
                    chimpId: event.chimpId,
                    status: event.status,
                    profile: event.profile,
                    topics: event.topics,
                    timestamp: event.timestamp,
                  })}\n\n`,
                ),
              );
            }
          } catch (e) {
            log.error({ err: e }, "Chimps live stream error");
            controller.error(e);
          }
        })();
      },
      cancel() {
        clearInterval(pingInterval);
        sub.unsubscribe();
      },
    });
  }
}
