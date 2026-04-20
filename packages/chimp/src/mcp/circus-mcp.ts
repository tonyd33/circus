import { type Logger, Protocol } from "@mnke/circus-shared";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import { z } from "zod";
import type { StoredEventContext } from "@/chimp-brain/event-contexts";

type PublishFn = (message: Protocol.ChimpOutputMessage) => void;

export class CircusMcp {
  private mcpServer: McpServer;
  private transport: WebStandardStreamableHTTPServerTransport;
  private eventContext: Protocol.EventContext | undefined;
  private eventContexts: StoredEventContext[] = [];
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

  setEventContext(context: Protocol.EventContext | undefined): void {
    this.eventContext = context;
  }

  setEventContexts(list: StoredEventContext[]): void {
    this.eventContexts = list;
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

    this.mcpServer.tool(
      "list_event_contexts",
      "List every event context (Discord interactions, GitHub issues/PRs, " +
        "etc.) this chimp has been exposed to so far. Use alongside the " +
        "platform-specific response tools to reply on a channel other than " +
        "the one that triggered the current turn.",
      {},
      async () => {
        this.logger.info(
          { tool: "list_event_contexts", count: this.eventContexts.length },
          "MCP tool called: list_event_contexts",
        );
        return {
          content: [
            {
              type: "text" as const,
              text: JSON.stringify(this.eventContexts),
            },
          ],
        };
      },
    );

    this.mcpServer.tool(
      "respond",
      "Send a response back to the originating platform (Discord, GitHub, dashboard, etc.)",
      {
        content: z.string().describe("Response content to send"),
      },
      async (args) => {
        const ctx = this.eventContext;
        this.logger.info(
          { tool: "respond", source: ctx?.source ?? "unknown" },
          "MCP tool called: respond",
        );

        if (!ctx || ctx.source === "unknown" || ctx.source === "dashboard") {
          publish(
            Protocol.createAgentMessageResponse(args.content, "mcp-respond"),
          );
        } else if (ctx.source === "discord") {
          publish({
            type: "discord-response",
            interactionToken: ctx.interactionToken,
            applicationId: ctx.applicationId,
            content: args.content,
          });
        } else if (ctx.source === "github") {
          const issueNumber =
            ctx.event.name === "pull_request_review_comment.created"
              ? ctx.event.prNumber
              : ctx.event.issueNumber;
          if (ctx.installationId === undefined) {
            this.logger.warn(
              { repo: ctx.repo, issueNumber, event: ctx.event.name },
              "Cannot post GitHub comment: missing installationId in context",
            );
          } else {
            publish({
              type: "github-comment",
              installationId: ctx.installationId,
              repo: ctx.repo,
              issueNumber,
              content: args.content,
            });
          }
        }

        return {
          content: [
            {
              type: "text" as const,
              text: `Response sent via ${ctx?.source ?? "default"}`,
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
