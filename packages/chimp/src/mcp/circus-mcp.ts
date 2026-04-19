import type { Logger, Protocol } from "@mnke/circus-shared";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";

type PublishFn = (message: Protocol.ChimpOutputMessage) => void;

export class CircusMcp {
  private mcpServer: McpServer;
  private transport: WebStandardStreamableHTTPServerTransport;
  private httpServer: ReturnType<typeof Bun.serve> | null = null;
  private logger: Logger.Logger;

  constructor(publish: PublishFn, logger: Logger.Logger) {
    this.logger = logger;

    this.mcpServer = new McpServer({
      name: "circus",
      version: "0.1.0",
    });

    this.transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });

    this.registerTools(publish);
  }

  private registerTools(publish: PublishFn): void {
    this.mcpServer.tool(
      "chimp_request",
      "Request creation of a new chimp agent with a specific profile and initial message",
      {
        profile: z.string().describe("Profile name for the new chimp"),
        chimpId: z.string().describe("Unique ID for the new chimp"),
        message: z
          .string()
          .describe("Initial message to send to the new chimp"),
      },
      async (args) => {
        this.logger.info(
          {
            tool: "chimp_request",
            targetProfile: args.profile,
            targetChimpId: args.chimpId,
          },
          "MCP tool called: chimp_request",
        );
        publish({
          type: "chimp-request",
          profile: args.profile,
          chimpId: args.chimpId,
          message: args.message,
        });
        return {
          content: [
            {
              type: "text" as const,
              text: `Chimp requested: ${args.chimpId} (profile: ${args.profile})`,
            },
          ],
        };
      },
    );
  }

  async start(): Promise<string> {
    await this.mcpServer.connect(this.transport);

    this.httpServer = Bun.serve({
      port: 0,
      fetch: async (req) => {
        this.logger.debug(
          { method: req.method, url: req.url },
          "MCP HTTP request",
        );
        try {
          const res = await this.transport.handleRequest(req);
          this.logger.debug({ status: res.status }, "MCP HTTP response");
          return res;
        } catch (err) {
          this.logger.error({ err }, "MCP HTTP error");
          return new Response("Internal Server Error", { status: 500 });
        }
      },
    });

    const url = `http://localhost:${this.httpServer.port}`;
    this.logger.info({ url }, "MCP server started");
    return url;
  }

  async stop(): Promise<void> {
    this.httpServer?.stop();
    await this.mcpServer.close();
    this.logger.info("MCP server stopped");
  }
}
