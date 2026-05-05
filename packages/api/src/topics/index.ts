import { Standards } from "@mnke/circus-shared";
import { Elysia } from "elysia";
import { z } from "zod";
import type { Deps } from "../deps";

export const topicsController = (deps: Deps) =>
  new Elysia({ prefix: "/api/topics", name: "topics" }).get(
    "/",
    async () => ({ topics: await deps.chimpService.listAllTopics() }),
    {
      response: z.object({
        topics: z.record(z.string(), z.array(Standards.Topic.TopicSchema)),
      }),
      detail: {
        tags: ["topics"],
        summary: "List all topic subscriptions by chimp",
      },
    },
  );
