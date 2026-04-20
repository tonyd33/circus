import { type Logger, Protocol, Standards } from "@mnke/circus-shared";
import type { NatsConnection } from "nats";
import { z } from "zod";

const Naming = Standards.Chimp.Naming;

const SendMessageBody = z.object({
  prompt: z.string().min(1),
});

export class MessageRouter {
  private nc: NatsConnection;
  private logger: Logger.Logger;

  constructor(nc: NatsConnection, logger: Logger.Logger) {
    this.nc = nc;
    this.logger = logger;
  }

  get routes() {
    return {
      "/api/chimp/:profile/:chimpId/message": {
        POST: async (
          req: Bun.BunRequest<"/api/chimp/:profile/:chimpId/message">,
        ): Promise<Response> => {
          const { profile, chimpId } = req.params;

          if (!profile || !chimpId) {
            return new Response("Missing profile or chimpId", { status: 400 });
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

          try {
            const js = this.nc.jetstream();
            await js.publish(
              Naming.commandSubject(chimpId),
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
          const sub = nc.subscribe(`${Standards.Chimp.Prefix.META}.>`);

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
                  log.error({ err: e }, "Meta events stream error");
                  controller.error(e);
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
