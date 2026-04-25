import type { TopicRegistry } from "@mnke/circus-shared/components";
import type * as Logger from "@mnke/circus-shared/logger";
import type { NatsConnection } from "nats";
import { createActivityStream } from "../services/activity-service";

export class ActivityRouter {
  constructor(
    private nc: NatsConnection,
    private topicRegistry: TopicRegistry,
    private logger: Logger.Logger,
  ) {}

  get routes() {
    return {
      "/api/chimp/:chimpId/activity": {
        GET: async (
          req: Bun.BunRequest<"/api/chimp/:chimpId/activity">,
        ): Promise<Response> => {
          const { chimpId } = req.params;
          if (!chimpId) return new Response("Missing chimpId", { status: 400 });

          try {
            const stream = await createActivityStream(
              chimpId,
              this.nc,
              this.topicRegistry,
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
      },
    };
  }
}
