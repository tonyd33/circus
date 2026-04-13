import { Standards } from "@mnke/circus-shared";
import { createLogger } from "@mnke/circus-shared/logger";
import { connect, type NatsConnection } from "nats";
import type { Adapter } from "./adapters/index.ts";
import type { RouteConfig } from "./types.ts";

const logger = createLogger("Usher");

export class Usher {
  private nc: NatsConnection | null = null;
  private natsUrl: string;
  private routes: RouteConfig[];
  private adapterRegistry: Record<string, () => Adapter>;

  constructor(
    routes: RouteConfig[],
    natsUrl: string,
    adapterRegistry: Record<string, () => Adapter>,
  ) {
    this.routes = routes;
    this.natsUrl = natsUrl;
    this.adapterRegistry = adapterRegistry;
  }

  async serve(port: number): Promise<void> {
    this.nc = await connect({ servers: this.natsUrl });
    logger.info("Connected to NATS");

    const routeHandlers = this.buildRouteHandlers(this.nc);

    Bun.serve({
      port,
      routes: {
        "/healthz": new Response("OK"),
        ...routeHandlers,
      },
      fetch(_) {
        return new Response("Not Found", { status: 404 });
      },
    });

    logger.info({ port }, "Usher listening");
  }

  private buildRouteHandlers(
    nc: NatsConnection,
  ): Record<string, { POST: (req: Request) => Promise<Response> }> {
    const result: Record<
      string,
      { POST: (req: Request) => Promise<Response> }
    > = {};
    for (const route of this.routes) {
      const factory = this.adapterRegistry[route.adapter];
      if (!factory) {
        throw new Error(
          `Unknown adapter: ${route.adapter}. Available: ${Object.keys(this.adapterRegistry).join(", ")}`,
        );
      }
      const adapter = factory();
      result[route.path] = {
        POST: async (req: Request) => {
          if (req.method !== "POST") {
            return new Response("Method Not Allowed", { status: 405 });
          }
          try {
            const body = await req.json();
            const headers: Record<string, string> = {};
            req.headers.forEach((value, key) => {
              headers[key] = value;
            });
            const result = await adapter.handleEvent(body, headers);
            const subject = Standards.Chimp.Naming.inputSubject(result.chimpId);
            nc.publish(subject, JSON.stringify(result.command));
            logger.info(
              { chimpId: result.chimpId, path: route.path },
              "Published command",
            );
            return new Response("OK", { status: 200 });
          } catch (error) {
            logger.error(
              { err: error, path: route.path },
              "Error handling request",
            );
            return new Response("Internal Server Error", { status: 500 });
          }
        },
      };
      logger.info(
        { adapter: route.adapter, path: route.path },
        "Route mounted",
      );
    }

    return result;
  }

  async shutdown(): Promise<void> {
    if (this.nc) {
      await this.nc.drain();
      await this.nc.close();
    }
    logger.info("Shutdown complete");
  }
}
