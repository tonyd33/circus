/**
 * Dashboard - Chimps Routes
 *
 * Proxies chimp status requests to ledger
 */

type ProxyFn = (path: string) => Promise<Response>;

export function createChimpsRoutes(proxyToLedger: ProxyFn) {
  return {
    "/api/chimps": {
      GET: async () => proxyToLedger("/api/chimps"),
    },
    "/api/chimp/:chimpId/status": {
      GET: async (req: Bun.BunRequest<"/api/chimp/:chimpId/status">) =>
        proxyToLedger(`/api/chimp/${req.params.chimpId}/status`),
    },
  };
}
