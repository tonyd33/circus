import { type Logger, Protocol, Standards } from "@mnke/circus-shared";
import { connect, type JetStreamClient, type NatsConnection } from "nats";
import { z } from "zod";

const Naming = Standards.Chimp.Naming;

const SendMessageBody = z.object({
  prompt: z.string().min(1),
});

export class MessageRouter {
  private nc: NatsConnection | null = null;
  private js: JetStreamClient | null = null;
  private logger: Logger.Logger;

  constructor(
    private natsUrl: string,
    logger: Logger.Logger,
  ) {
    this.logger = logger;
  }

  async initialize(): Promise<void> {
    this.nc = await connect({
      servers: this.natsUrl,
      maxReconnectAttempts: -1,
      reconnectTimeWait: 2000,
    });
    this.js = this.nc.jetstream();
    this.logger.info({ url: this.natsUrl }, "MessageRouter connected to NATS");
  }

  async cleanup(): Promise<void> {
    if (this.nc) {
      await this.nc.drain();
      await this.nc.close();
      this.nc = null;
      this.js = null;
      this.logger.info("MessageRouter NATS connection closed");
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
            this.logger.error("MessageRouter not initialized");
            return new Response("Service unavailable", { status: 503 });
          }

          try {
            await this.js.publish(
              Naming.inputSubject(chimpId),
              JSON.stringify(Protocol.createAgentCommand(parsed.data.prompt)),
            );
            return Response.json({ ok: true });
          } catch (e) {
            this.logger.error({ err: e }, "Failed to publish message");
            return new Response("Failed to send message", { status: 500 });
          }
        },
      },
      "/api/meta/events": {
        GET: (): Response => {
          const nc = this.nc;
          const log = this.logger;
          if (!nc) {
            log.error("MessageRouter not initialized");
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
                      log.warn(
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
                  log.error({ err: e }, "SSE stream error");
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
