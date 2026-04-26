import type * as Logger from "@mnke/circus-shared/logger";
import type { NatsConnection } from "nats";
import { createChannelActivityStream } from "../services/activity-service";
import type { ChannelService } from "../services/channel-service";

const SSE_HEADERS = {
  "Content-Type": "text/event-stream",
  "Cache-Control": "no-cache",
  Connection: "keep-alive",
};

export class ChannelRouter {
  constructor(
    private channelService: ChannelService,
    private nc: NatsConnection,
    private logger: Logger.Logger,
  ) {}

  get routes() {
    return {
      "/api/channels": {
        GET: async () => {
          const channels = await this.channelService.listChannels();
          return Response.json({ channels });
        },
      },
      "/api/channels/:channelId/activity": {
        GET: async (
          req: Bun.BunRequest<"/api/channels/:channelId/activity">,
        ): Promise<Response> => {
          const { channelId } = req.params;
          if (!channelId) {
            return new Response("Missing channelId", { status: 400 });
          }

          try {
            const stream = await createChannelActivityStream(
              channelId,
              this.nc,
              this.logger,
            );
            return new Response(stream, { headers: SSE_HEADERS });
          } catch (e) {
            this.logger.error({ err: e }, "Channel SSE error");
            return new Response("Internal Server Error", { status: 500 });
          }
        },
      },
    };
  }
}
