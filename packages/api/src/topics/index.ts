import { Elysia } from "elysia";
import type { Deps } from "../deps";

export const topicsController = (deps: Deps) =>
  new Elysia({ prefix: "/api/topics", name: "topics" }).get("/", async () => ({
    topics: await deps.chimpService.listAllTopics(),
  }));
