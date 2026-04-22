import { type Logger, Protocol, Standards } from "@mnke/circus-shared";
import type { TopicRegistry } from "@mnke/circus-shared/lib";
import type { NatsConnection } from "nats";
import type { RedisStatusSource } from "../lib/status-source";

const PING_INTERVAL_MS = 3_000;

export class ChimpRouter {
  private statusSource: RedisStatusSource;
  private nc: NatsConnection;
  private topicRegistry: TopicRegistry;
  private logger: Logger.Logger;

  constructor(
    statusSource: RedisStatusSource,
    nc: NatsConnection,
    topicRegistry: TopicRegistry,
    logger: Logger.Logger,
  ) {
    this.statusSource = statusSource;
    this.nc = nc;
    this.topicRegistry = topicRegistry;
    this.logger = logger;
  }

  get routes() {
    return {
      "/api/chimps": {
        GET: async () => {
          const chimps = await this.statusSource.list();
          return Response.json({ chimps });
        },
      },
      "/api/topics": {
        GET: async () => {
          const chimps = await this.statusSource.list();
          const allTopics: Record<string, Standards.Topic.Topic[]> = {};

          for (const chimp of chimps) {
            allTopics[chimp.chimpId] = await this.topicRegistry.listForChimp(
              chimp.chimpId,
            );
          }

          return Response.json({ topics: allTopics });
        },
      },
      "/api/chimp/:chimpId/topics": {
        GET: async (req: Bun.BunRequest<"/api/chimp/:chimpId/topics">) => {
          const chimpId = req.params.chimpId;
          if (!chimpId) {
            return new Response("Missing chimpId", { status: 400 });
          }
          const topics = await this.topicRegistry.listForChimp(chimpId);
          return Response.json({ topics });
        },
      },
      "/api/chimp/:chimpId/status": {
        GET: async (req: Bun.BunRequest<"/api/chimp/:chimpId/status">) => {
          const chimpId = req.params.chimpId;
          if (!chimpId) {
            return new Response("Missing chimpId", { status: 400 });
          }

          const chimp = await this.statusSource.get(chimpId);
          if (!chimp) {
            return Response.json({ error: "Not found" }, { status: 404 });
          }

          return Response.json(chimp);
        },
      },
      "/api/chimps/live": {
        GET: async (): Promise<Response> => {
          const encoder = new TextEncoder();
          const nc = this.nc;
          const statusSource = this.statusSource;
          const log = this.logger;

          const sub = nc.subscribe(`${Standards.Chimp.Prefix.META}.>`);
          let pingInterval: ReturnType<typeof setInterval>;

          const stream = new ReadableStream<Uint8Array>({
            async start(controller) {
              try {
                const chimps = await statusSource.list();
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
                          profile: event.profile,
                          chimpId: event.chimpId,
                          status: event.status,
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

          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          });
        },
      },
    };
  }
}
