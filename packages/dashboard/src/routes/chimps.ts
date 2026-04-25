import type { ChimpService } from "../services/chimp-service";

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
