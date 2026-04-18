import { Logger, Protocol, Standards } from "@mnke/circus-shared";
import { connect, type JetStreamClient, type NatsConnection } from "nats";
import { z } from "zod";

const logger = Logger.createLogger("MessageRouter");
const Naming = Standards.Chimp.Naming;

const SendMessageBody = z.object({
  prompt: z.string().min(1),
});

export class MessageRouter {
  private nc: NatsConnection | null = null;
  private js: JetStreamClient | null = null;

  constructor(private natsUrl: string) {}

  async initialize(): Promise<void> {
    this.nc = await connect({
      servers: this.natsUrl,
      maxReconnectAttempts: -1,
      reconnectTimeWait: 2000,
    });
    this.js = this.nc.jetstream();
    logger.info({ url: this.natsUrl }, "MessageRouter connected to NATS");
  }

  async cleanup(): Promise<void> {
    if (this.nc) {
      await this.nc.drain();
      await this.nc.close();
      this.nc = null;
      this.js = null;
      logger.info("MessageRouter NATS connection closed");
    }
  }

  get routes() {
    return {
      "/api/chimp/:chimpId/message": {
        POST: async (
          req: Bun.BunRequest<"/api/chimp/:chimpId/message">,
        ): Promise<Response> => {
          const chimpId = req.params.chimpId;

          if (!chimpId) {
            return new Response("Missing chimpId", { status: 400 });
          }

          const parsed = SendMessageBody.safeParse(
            await req.json().catch(() => null),
          );
          if (!parsed.success) {
            return Response.json(
              { error: parsed.error.flatten() },
              { status: 400 },
            );
          }

          if (!this.js) {
            logger.error("MessageRouter not initialized");
            return new Response("Service unavailable", { status: 503 });
          }

          try {
            await this.js.publish(
              Naming.inputSubject(chimpId),
              JSON.stringify(Protocol.createAgentCommand(parsed.data.prompt)),
            );
            return Response.json({ ok: true });
          } catch (e) {
            logger.error({ err: e }, "Failed to publish message");
            return new Response("Failed to send message", { status: 500 });
          }
        },
      },
      "/api/meta/events": {
        GET: (): Response => {
          const nc = this.nc;
          if (!nc) {
            logger.error("MessageRouter not initialized");
            return new Response("Service unavailable", { status: 503 });
          }

          const sub = nc.subscribe("chimp.meta.*.*");

          const stream = new ReadableStream<Uint8Array>({
            start(controller) {
              (async () => {
                try {
                  for await (const msg of sub) {
                    const raw = msg.json();
                    const parsed = Protocol.MetaEventSchema.safeParse(raw);

                    if (!parsed.success) {
                      logger.warn(
                        { error: parsed.error.issues },
                        "Invalid meta event",
                      );
                      continue;
                    }

                    const event: Protocol.MetaEvent = parsed.data;
                    const payload = JSON.stringify(event);
                    controller.enqueue(
                      new TextEncoder().encode(`data: ${payload}\n\n`),
                    );
                  }
                } catch (e) {
                  logger.error({ err: e }, "SSE stream error");
                }
              })();
            },
            cancel() {
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
