import type { Logger } from "@mnke/circus-shared";
import { createActivityStream } from "../streams/activity-stream";

export function createActivityRoute(natsUrl: string, logger: Logger.Logger) {
  return async (
    req: Bun.BunRequest<"/api/chimp/:chimpId/activity">,
  ): Promise<Response> => {
    const chimpId = req.params.chimpId;

    if (!chimpId) {
      return new Response("Missing chimpId", { status: 400 });
    }

    try {
      const stream = await createActivityStream(chimpId, natsUrl, logger);
      return new Response(stream, {
        headers: {
          "Content-Type": "text/event-stream",
          "Cache-Control": "no-cache",
          Connection: "keep-alive",
        },
      });
    } catch (e) {
      logger.error({ err: e }, "SSE error");
      return new Response("Internal Server Error", { status: 500 });
    }
  };
}
