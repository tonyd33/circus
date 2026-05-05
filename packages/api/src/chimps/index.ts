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
const ErrorBody = z.object({ error: z.string() });
const SuccessBody = z.object({ success: z.literal(true) });

export const chimpsController = (deps: Deps) =>
  new Elysia({ prefix: "/api/chimps", name: "chimps" })
    .get("/", async () => ({ chimps: await deps.chimpService.listChimps() }), {
      response: z.object({
        chimps: z.array(Standards.Chimp.ChimpStateWithProfileSchema),
      }),
      detail: { tags: ["chimps"], summary: "List all chimps" },
    })
    .get(
      "/live",
      ({ set }) => {
        Object.assign(set.headers, SSE_HEADERS);
        return deps.chimpService.createLiveStream();
      },
      { detail: { hide: true } },
    )
    .get(
      "/:chimpId/status",
      async ({ params, status }) => {
        const chimp = await deps.chimpService.getChimpStatus(params.chimpId);
        return chimp ?? status(404, { error: "Not found" });
      },
      {
        params: ChimpParams,
        response: { 200: Standards.Chimp.ChimpStateSchema, 404: ErrorBody },
        detail: { tags: ["chimps"], summary: "Get chimp status" },
      },
    )
    .get(
      "/:chimpId/topics",
      async ({ params }) => ({
        topics: await deps.chimpService.listChimpTopics(params.chimpId),
      }),
      {
        params: ChimpParams,
        response: z.object({ topics: z.array(Standards.Topic.TopicSchema) }),
        detail: { tags: ["chimps"], summary: "List chimp topic subscriptions" },
      },
    )
    .post(
      "/:chimpId/topics",
      async ({ params, body }) => {
        await deps.chimpService.subscribeTopic(body, params.chimpId);
        return { success: true as const };
      },
      {
        params: ChimpParams,
        body: Standards.Topic.GithubTopicSchema,
        response: SuccessBody,
        detail: {
          tags: ["chimps"],
          summary: "Subscribe chimp to a github topic",
        },
      },
    )
    .delete(
      "/:chimpId/topics",
      async ({ params, body }) => {
        await deps.chimpService.unsubscribeTopic(body, params.chimpId);
        return { success: true as const };
      },
      {
        params: ChimpParams,
        body: Standards.Topic.GithubTopicSchema,
        response: SuccessBody,
        detail: {
          tags: ["chimps"],
          summary: "Unsubscribe chimp from a github topic",
        },
      },
    );
