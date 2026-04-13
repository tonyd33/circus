import { createActivityStream } from "../streams/activity-stream";

export function createActivityRoute(natsUrl: string) {
  return async (
    req: Bun.BunRequest<"/api/chimp/:chimpId/activity">,
  ): Promise<Response> => {
    const chimpId = req.params.chimpId;

    if (!chimpId) {
      return new Response("Missing chimpId", { status: 400 });
    }

    try {
      const stream = await createActivityStream(chimpId, natsUrl);
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } catch (e) {
      console.error("SSE error:", e);
      return new Response("Internal Server Error", { status: 500 });
    }
  };
}
