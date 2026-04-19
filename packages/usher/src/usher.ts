import { type Logger, Standards } from "@mnke/circus-shared";
import { connect, type NatsConnection } from "nats";
import type { Adapter } from "./adapters/index.ts";
import type { RouteConfig } from "./types.ts";

export class Usher {
  private nc: NatsConnection | null = null;
  private natsUrl: string;
  private routes: RouteConfig[];
  private adapterRegistry: Record<string, (logger: Logger.Logger) => Adapter>;
  private logger: Logger.Logger;
  private server: Bun.Server<Bun.WebSocket> | null = null;

  constructor(
    routes: RouteConfig[],
    natsUrl: string,
    adapterRegistry: Record<string, (logger: Logger.Logger) => Adapter>,
    logger: Logger.Logger,
  ) {
    this.routes = routes;
    this.natsUrl = natsUrl;
    this.adapterRegistry = adapterRegistry;
    this.logger = logger;
  }

  async serve(port: number): Promise<void> {
    this.nc = await connect({ servers: this.natsUrl });
    this.logger.info("Connected to NATS");

    const routeHandlers = this.buildRouteHandlers(this.nc);

    this.server = Bun.serve({
      port,
      routes: {
        "/healthz": new Response("ok"),
        ...routeHandlers,
      },
      fetch(_) {
        return new Response("Not Found", { status: 404 });
      },
    });

    this.logger.info({ port }, "Usher listening");
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
      const adapterLogger = this.logger.child({ adapter: route.adapter });
      const adapter = factory(adapterLogger);
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
            const { result, response } = await adapter.handleEvent(
              body,
              headers,
            );
            if (result) {
              const subject = Standards.Chimp.Naming.inputSubject(
                result.profile,
                result.chimpId,
              );
              nc.publish(subject, JSON.stringify(result.command));
              adapterLogger.info(
                { chimpId: result.chimpId, path: route.path },
                "Published command",
              );
            }
            return response;
          } catch (error) {
            adapterLogger.error(
              { err: error, path: route.path },
              "Error handling request",
            );
            return new Response("Internal Server Error", { status: 500 });
          }
        },
      };
      this.logger.info(
        { adapter: route.adapter, path: route.path },
        "Route mounted",
      );
    }

    return result;
  }

  async shutdown(): Promise<void> {
    await this.server?.stop();
    if (this.nc) {
      await this.nc.drain();
      await this.nc.close();
    }
    this.logger.info("Shutdown complete");
  }
}
