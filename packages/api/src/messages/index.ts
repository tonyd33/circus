import { Elysia, t } from "elysia";
import { z } from "zod";
import type { Deps } from "../deps";

const SSE_HEADERS = {
  "content-type": "text/event-stream",
  "cache-control": "no-cache",
  connection: "keep-alive",
};

const SendMessageBody = z.object({
  prompt: z.string().min(1),
});

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
      {
        params: t.Object({ chimpId: t.String() }),
        body: SendMessageBody,
      },
    )
    .get("/api/meta/events", ({ set }) => {
      Object.assign(set.headers, SSE_HEADERS);
      return deps.messageService.createMetaEventStream();
    });
