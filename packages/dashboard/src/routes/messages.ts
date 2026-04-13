import { createLogger } from "@mnke/circus-shared/logger";
import { createAgentCommand } from "@mnke/circus-shared/protocol";
import { Naming } from "@mnke/circus-shared/standards/chimp";
import { connect, type JetStreamClient, type NatsConnection } from "nats";
import { z } from "zod";

const logger = createLogger("MessageRouter");

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
              JSON.stringify(createAgentCommand(parsed.data.prompt)),
            );
            return Response.json({ ok: true });
          } catch (e) {
            logger.error({ err: e }, "Failed to publish message");
            return new Response("Failed to send message", { status: 500 });
          }
        },
      },
    };
  }
}
