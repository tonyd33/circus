import { z } from "zod";
import type { MessageService } from "../services/message-service";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

const SendMessageBody = z.object({
  prompt: z.string().min(1),
});

export class MessageRouter {
  constructor(private messageService: MessageService) {}

  get routes() {
    return {
      "/api/chimp/:chimpId/message": {
        POST: async (
          req: Bun.BunRequest<"/api/chimp/:chimpId/message">,
        ): Promise<Response> => {
          const { chimpId } = req.params;
          if (!chimpId) return new Response("Missing chimpId", { status: 400 });

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
            await this.messageService.sendCommand(chimpId, parsed.data.prompt);
            return Response.json({ ok: true });
          } catch {
            return new Response("Failed to send message", { status: 500 });
          }
        },
      },
      "/api/meta/events": {
        GET: (): Response => {
          const stream = this.messageService.createMetaEventStream();
          return new Response(stream, { headers: SSE_HEADERS });
        },
      },
    };
  }
}
