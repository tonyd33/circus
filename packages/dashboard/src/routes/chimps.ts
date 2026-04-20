import { type Logger, Protocol, Standards } from "@mnke/circus-shared";
import type { NatsConnection } from "nats";
import type { RedisStatusSource } from "../lib/status-source";

const PING_INTERVAL_MS = 3_000;

export class ChimpRouter {
  private statusSource: RedisStatusSource;
  private nc: NatsConnection;
  private logger: Logger.Logger;

  constructor(
    statusSource: RedisStatusSource,
    nc: NatsConnection,
    logger: Logger.Logger,
  ) {
    this.statusSource = statusSource;
    this.nc = nc;
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
