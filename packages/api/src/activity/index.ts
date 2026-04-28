import { Standards } from "@mnke/circus-shared";
import { Elysia } from "elysia";
import { z } from "zod";
import type { Deps } from "../deps";
import { createActivityStream } from "./service";

const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache",
  connection: "keep-alive",
};

const ChimpParams = z.object({ chimpId: Standards.Chimp.ChimpIdSchema });

export const activityController = (deps: Deps) =>
  new Elysia({ name: "activity" }).get(
    "/api/chimps/:chimpId/activity",
    async ({ params, set, status }) => {
      try {
        const stream = await createActivityStream(
          params.chimpId,
          deps.nc,
          deps.topicRegistry,
          deps.logger.child({ component: "ActivityController" }),
        );
        Object.assign(set.headers, SSE_HEADERS);
        return stream;
      } catch (e) {
        deps.logger.error({ err: e }, "SSE error");
        return status(500, { error: "Internal Server Error" });
      }
    },
    { params: ChimpParams },
  );
