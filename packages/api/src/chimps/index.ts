import { Standards } from "@mnke/circus-shared";
import { Elysia } from "elysia";
import { z } from "zod";
import type { Deps } from "../deps";

const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache",
  connection: "keep-alive",
};

const ChimpParams = z.object({ chimpId: Standards.Chimp.ChimpIdSchema });

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
      { params: ChimpParams },
    )
    .get(
      "/:chimpId/topics",
      async ({ params }) => ({
        topics: await deps.chimpService.listChimpTopics(params.chimpId),
      }),
      { params: ChimpParams },
    )
    .post(
      "/:chimpId/topics",
      async ({ params, body }) => {
        await deps.chimpService.subscribeTopic(body, params.chimpId);
        return { success: true };
      },
      { params: ChimpParams, body: Standards.Topic.GithubTopicSchema },
    )
    .delete(
      "/:chimpId/topics",
      async ({ params, body }) => {
        await deps.chimpService.unsubscribeTopic(body, params.chimpId);
        return { success: true };
      },
      { params: ChimpParams, body: Standards.Topic.GithubTopicSchema },
    );
