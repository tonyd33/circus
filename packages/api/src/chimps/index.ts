import { Standards } from "@mnke/circus-shared";
import { Elysia, t } from "elysia";
import type { Deps } from "../deps";

const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache",
  connection: "keep-alive",
};

export const chimpsController = (deps: Deps) =>
  new Elysia({ prefix: "/api/chimps", name: "chimps" })
    .get("/", async () => ({ chimps: await deps.chimpService.listChimps() }))
    .get("/live", ({ set }) => {
      Object.assign(set.headers, SSE_HEADERS);
      return deps.chimpService.createLiveStream();
    })
    .get(
      "/:chimpId/status",
      async ({ params, status }) => {
        const chimp = await deps.chimpService.getChimpStatus(params.chimpId);
        return chimp ?? status(404, { error: "Not found" });
      },
      { params: t.Object({ chimpId: t.String() }) },
    )
    .get(
      "/:chimpId/topics",
      async ({ params }) => ({
        topics: await deps.chimpService.listChimpTopics(params.chimpId),
      }),
      { params: t.Object({ chimpId: t.String() }) },
    )
    .post(
      "/:chimpId/topics",
      async ({ params, body, status }) => {
        if (body.platform !== "github") {
          return status(400, { error: "Only GitHub topics are supported" });
        }
        await deps.chimpService.subscribeTopic(body, params.chimpId);
        return { success: true };
      },
      {
        params: t.Object({ chimpId: t.String() }),
        body: Standards.Topic.TopicSchema,
      },
    )
    .delete(
      "/:chimpId/topics",
      async ({ params, body, status }) => {
        if (body.platform !== "github") {
          return status(400, { error: "Only GitHub topics are supported" });
        }
        await deps.chimpService.unsubscribeTopic(body, params.chimpId);
        return { success: true };
      },
      {
        params: t.Object({ chimpId: t.String() }),
        body: Standards.Topic.TopicSchema,
      },
    );
