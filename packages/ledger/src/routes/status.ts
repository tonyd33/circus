/**
 * Ledger - Status Routes
 */

import type { RedisStatusSource } from "../status-source.ts";

export function createStatusRoutes(statusSource: RedisStatusSource) {
  const GET_chimps = async () => {
    const chimps = await statusSource.list();
    return new Response(JSON.stringify({ chimps }), {
      headers: { "Content-Type": "application/json" },
    });
  };

  const GET_chimp_status = async (
    req: Bun.BunRequest<"/api/chimp/:chimpId/status">,
  ) => {
    const chimpId = req.params.chimpId;
    if (!chimpId) {
      return new Response("Missing chimpId", { status: 400 });
    }

    const chimp = await statusSource.get(chimpId);
    if (!chimp) {
      return new Response(JSON.stringify({ error: "Not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify(chimp), {
      headers: { "Content-Type": "application/json" },
    });
  };

  return {
    "/api/chimps": { GET: GET_chimps },
    "/api/chimp/:chimpId/status": { GET: GET_chimp_status },
  };
}
