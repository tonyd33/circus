import type * as Logger from "@mnke/circus-shared/logger";
import { serve } from "bun";
import index from "./index.html";

export interface DashboardConfig {
  port: number;
}

export class Dashboard {
  private config: DashboardConfig;
  private logger: Logger.Logger;
  private server: ReturnType<typeof serve> | null = null;
  private shuttingDown = false;

  constructor(config: DashboardConfig, logger: Logger.Logger) {
    this.config = config;
    this.logger = logger;
  }

  async start(): Promise<void> {
    this.server = serve({
      port: this.config.port,
      routes: {
        "/healthz": new Response("OK", { status: 200 }),
        "/*": index,
      },
      development: process.env.NODE_ENV !== "production" && {
        hmr: true,
        console: true,
      },
    });

    this.logger.info(
      { url: this.server.url.toString() },
      "Dashboard server started",
    );
  }

  async stop(): Promise<void> {
    if (this.shuttingDown) return;
    this.shuttingDown = true;
    this.server?.stop();
  }
}
