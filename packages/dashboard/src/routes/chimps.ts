import type { ChimpService } from "../services/chimp-service";
import { TopicSchema } from "@mnke/circus-shared/standards/topic";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

export class ChimpRouter {
  constructor(private chimpService: ChimpService) {}

  get routes() {
    return {
      "/api/chimps": {
        GET: async () => {
          const chimps = await this.chimpService.listChimps();
          return Response.json({ chimps });
        },
      },
      "/api/topics": {
        GET: async () => {
          const topics = await this.chimpService.listAllTopics();
          return Response.json({ topics });
        },
      },
      "/api/chimp/:chimpId/topics": {
        GET: async (req: Bun.BunRequest<"/api/chimp/:chimpId/topics">) => {
          const chimpId = req.params.chimpId;
          if (!chimpId) return new Response("Missing chimpId", { status: 400 });

          const topics = await this.chimpService.listChimpTopics(chimpId);
          return Response.json({ topics });
        },
        POST: async (req: Bun.BunRequest<"/api/chimp/:chimpId/topics">) => {
          const chimpId = req.params.chimpId;
          if (!chimpId) return new Response("Missing chimpId", { status: 400 });

          const body = await req.json().catch(() => null);
          const parsed = TopicSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json(
              { error: "Invalid topic", details: parsed.error.issues },
              { status: 400 },
            );
          }

          await this.chimpService.subscribeTopic(parsed.data, chimpId);
          return Response.json({ success: true });
        },
        DELETE: async (req: Bun.BunRequest<"/api/chimp/:chimpId/topics">) => {
          const chimpId = req.params.chimpId;
          if (!chimpId) return new Response("Missing chimpId", { status: 400 });

          const body = await req.json().catch(() => null);
          const parsed = TopicSchema.safeParse(body);
          if (!parsed.success) {
            return Response.json(
              { error: "Invalid topic", details: parsed.error.issues },
              { status: 400 },
            );
          }

          await this.chimpService.unsubscribeTopic(parsed.data, chimpId);
          return Response.json({ success: true });
        },
      },
      "/api/chimp/:chimpId/status": {
        GET: async (req: Bun.BunRequest<"/api/chimp/:chimpId/status">) => {
          const chimpId = req.params.chimpId;
          if (!chimpId) return new Response("Missing chimpId", { status: 400 });

          const chimp = await this.chimpService.getChimpStatus(chimpId);
          if (!chimp)
            return Response.json({ error: "Not found" }, { status: 404 });

          return Response.json(chimp);
        },
      },
      "/api/chimps/live": {
        GET: (): Response => {
          const stream = this.chimpService.createLiveStream();
          return new Response(stream, { headers: SSE_HEADERS });
        },
      },
    };
  }
}
