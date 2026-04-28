import { Standards } from "@mnke/circus-shared";
import { Elysia } from "elysia";
import { z } from "zod";
import type { Deps } from "../deps";
import { SendMessageBody } from "./model";

const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache",
  connection: "keep-alive",
};

const ChimpParams = z.object({ chimpId: Standards.Chimp.ChimpIdSchema });

export const messagesController = (deps: Deps) =>
  new Elysia({ name: "messages" })
    .post(
      "/api/chimps/:chimpId/messages",
      async ({ params, body, status }) => {
        try {
          await deps.messageService.sendCommand(params.chimpId, body.prompt);
          return { ok: true };
        } catch {
          return status(500, { error: "Failed to send message" });
        }
      },
      { params: ChimpParams, body: SendMessageBody },
    )
    .get("/api/meta/events", ({ set }) => {
      Object.assign(set.headers, SSE_HEADERS);
      return deps.messageService.createMetaEventStream();
    });
