import type { Logger } from "@mnke/circus-shared";
import type { NatsConnection } from "nats";
import { createActivityStream } from "../streams/activity-stream";

export class ActivityRouter {
  private nc: NatsConnection;
  private logger: Logger.Logger;

  constructor(nc: NatsConnection, logger: Logger.Logger) {
    this.nc = nc;
    this.logger = logger;
  }

  get routes() {
    return {
      "/api/chimp/:profile/:chimpId/activity": async (
        req: Bun.BunRequest<"/api/chimp/:profile/:chimpId/activity">,
      ): Promise<Response> => {
        const { profile, chimpId } = req.params;

        if (!profile || !chimpId) {
          return new Response("Missing profile or chimpId", { status: 400 });
        }

        try {
          const stream = await createActivityStream(
            profile,
            chimpId,
            this.nc,
            this.logger,
          );
          return new Response(stream, {
            headers: {
              "Content-Type": "text/event-stream",
              "Cache-Control": "no-cache",
              Connection: "keep-alive",
            },
          });
        } catch (e) {
          this.logger.error({ err: e }, "SSE error");
          return new Response("Internal Server Error", { status: 500 });
        }
      },
    };
  }
}
