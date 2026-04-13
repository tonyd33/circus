import { createAgentCommand } from "@mnke/circus-shared/protocol";
import { Naming } from "@mnke/circus-shared/standards/chimp";
import { connect } from "nats";
import { z } from "zod";

const SendMessageBody = z.object({
  prompt: z.string().min(1),
});

export function createMessageRoutes(natsUrl: string) {
  return {
    "/api/chimp/:chimpId/message": {
      POST: async (
        req: Bun.BunRequest<"/api/chimp/:chimpId/message">,
      ): Promise<Response> => {
        const chimpId = req.params.chimpId;

        if (!chimpId) {
          return new Response("Missing chimpId", { status: 400 });
        }

        const parsed = SendMessageBody.safeParse(
          await req.json().catch(() => null),
        );
        if (!parsed.success) {
          return Response.json(
            { error: parsed.error.flatten() },
            { status: 400 },
          );
        }

        try {
          const nc = await connect({ servers: natsUrl });
          const js = nc.jetstream();
          await js.publish(
            Naming.inputSubject(chimpId),
            JSON.stringify(createAgentCommand(parsed.data.prompt)),
          );
          await nc.close();
          return Response.json({ ok: true });
        } catch (e) {
          console.error("Failed to send message:", e);
          return new Response("Failed to send message", { status: 500 });
        }
      },
    },
  };
}
