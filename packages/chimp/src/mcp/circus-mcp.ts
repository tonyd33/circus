import { type Logger, Protocol, Standards } from "@mnke/circus-shared";
import type { ProfileStore, TopicRegistry } from "@mnke/circus-shared/lib";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import type { NatsConnection } from "nats";
import { z } from "zod";
import type { StoredEventContext } from "@/chimp-brain/event-contexts";

type PublishFn = (message: Protocol.ChimpOutputMessage) => void;

export interface CircusMcpConfig {
  publish: PublishFn;
  chimpId: string;
  profile: string;
  profileStore: ProfileStore;
  topicRegistry: TopicRegistry | null;
  nc: NatsConnection | null;
  logger: Logger.Logger;
}

export class CircusMcp {
  private activeTransports: Map<
    string,
    WebStandardStreamableHTTPServerTransport
  > = new Map();
  private eventContexts: StoredEventContext[] = [];
  private httpServer: ReturnType<typeof Bun.serve> | null = null;
  private config: CircusMcpConfig;

  constructor(config: CircusMcpConfig) {
    this.config = config;
  }

  setEventContexts(list: StoredEventContext[]): void {
    this.eventContexts = list;
  }

  private async createSessionHandler(): Promise<WebStandardStreamableHTTPServerTransport> {
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (id) => {
        this.activeTransports.set(id, transport);
      },
      onsessionclosed: (id) => {
        this.activeTransports.delete(id);
      },
    });
    const server = new McpServer({ name: "circus", version: "0.1.0" });
    this.registerTools(server);
    await server.connect(transport);
    return transport;
  }

  private registerTools(server: McpServer): void {
    const { publish } = this.config;

    server.tool(
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
        this.config.logger.info(
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

    server.tool(
      "list_event_contexts",
      "List every event context (Discord interactions, GitHub issues/PRs, " +
        "etc.) this chimp has been exposed to so far. Use alongside the " +
        "platform-specific response tools to reply on a channel other than " +
        "the one that triggered the current turn.",
      {},
      async () => {
        this.config.logger.info(
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

    server.tool(
      "github_respond",
      "Post a comment on a GitHub issue or pull request. Accepts explicit " +
        "arguments so you can reply on any GitHub channel you know about " +
        "(including ones from `list_event_contexts`), not only the one that " +
        "triggered the current turn.",
      {
        repo: z
          .string()
          .describe(
            "Target repository in 'owner/name' form (e.g. 'tonyd33/circus')",
          ),
        issueNumber: z
          .number()
          .describe("Issue or pull request number to comment on"),
        installationId: z
          .number()
          .describe("GitHub App installation id from the event context"),
        content: z.string().describe("Comment body"),
      },
      async (args) => {
        this.config.logger.info(
          {
            tool: "github_respond",
            repo: args.repo,
            issueNumber: args.issueNumber,
          },
          "MCP tool called: github_respond",
        );
        publish(Protocol.createGithubComment(args));
        return {
          content: [
            {
              type: "text" as const,
              text: `Comment posted to ${args.repo}#${args.issueNumber}`,
            },
          ],
        };
      },
    );

    server.tool(
      "discord_respond",
      "Post a reply to a Discord interaction. Accepts explicit arguments so " +
        "you can reply on any Discord interaction you know about (including " +
        "ones from `list_event_contexts`), not only the one that triggered " +
        "the current turn.",
      {
        interactionToken: z
          .string()
          .describe("Discord interaction token from the event context"),
        applicationId: z
          .string()
          .describe("Discord application id from the event context"),
        content: z.string().describe("Reply content"),
      },
      async (args) => {
        this.config.logger.info(
          { tool: "discord_respond", applicationId: args.applicationId },
          "MCP tool called: discord_respond",
        );
        publish(Protocol.createDiscordResponse(args));
        return {
          content: [
            {
              type: "text" as const,
              text: "Discord response sent",
            },
          ],
        };
      },
    );

    server.tool(
      "dashboard_respond",
      "Send a response back to the dashboard (or any caller that consumes " +
        "`agent-message-response`). Use this when the current turn was " +
        "triggered by the dashboard or no platform-specific context applies.",
      {
        content: z.string().describe("Response content to send"),
        sessionId: z
          .string()
          .optional()
          .describe(
            "Session id to tag the response with (defaults to 'mcp-respond')",
          ),
      },
      async (args) => {
        this.config.logger.info(
          { tool: "dashboard_respond", sessionId: args.sessionId },
          "MCP tool called: dashboard_respond",
        );
        publish(
          Protocol.createAgentMessageResponse(
            args.content,
            args.sessionId ?? "mcp-respond",
          ),
        );
        return {
          content: [
            {
              type: "text" as const,
              text: "Dashboard response sent",
            },
          ],
        };
      },
    );

    server.tool(
      "subscribe_topic",
      "Subscribe to a topic so future events matching it route to this chimp. Use after creating a PR, claiming an issue, etc.",
      {
        platform: z.literal("github").describe("Platform"),
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        type: z.enum(["pr", "issue"]).describe("PR or issue"),
        number: z.number().describe("PR/issue number"),
      },
      async (args) => {
        const topic: Standards.Topic.Topic = args;
        const { topicRegistry, nc, chimpId, profile, logger } = this.config;

        if (!topicRegistry || !nc) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Topic subscription unavailable (no NATS)",
              },
            ],
          };
        }

        const success = await topicRegistry.subscribe(topic, chimpId);
        if (!success) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Topic already claimed by another chimp",
              },
            ],
          };
        }

        const topicKey = Standards.Topic.serializeTopic(topic);
        logger.info({ topic: topicKey, chimpId }, "Subscribed to topic");

        return {
          content: [
            { type: "text" as const, text: `Subscribed to ${topicKey}` },
          ],
        };
      },
    );

    server.tool(
      "transmogrify",
      "Transform this chimp into a more powerful profile. Queues a handoff message for the new incarnation, then signals the platform to replace this pod. Use when the current profile is insufficient for the task.",
      {
        targetProfile: z.string().describe("Profile to transform into"),
        reason: z.string().describe("Why the transformation is needed"),
        summary: z
          .string()
          .describe("Summary of work done so far for the new incarnation"),
      },
      async (args) => {
        const { nc, chimpId, profile, logger } = this.config;

        if (!nc) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Transmogrify unavailable (no NATS)",
              },
            ],
          };
        }

        logger.info(
          { chimpId, targetProfile: args.targetProfile, reason: args.reason },
          "Transmogrify initiated",
        );

        publish({
          type: "transmogrify",
          targetProfile: args.targetProfile,
          reason: args.reason,
          summary: args.summary,
        });

        return {
          content: [
            {
              type: "text" as const,
              text: `Transmogrify initiated: ${profile} → ${args.targetProfile}. This pod will be replaced.`,
            },
          ],
        };
      },
    );

    server.tool(
      "list_profiles",
      "List available chimp profiles with descriptions, brain type, and model. Use to decide which profile to transmogrify into.",
      {},
      async () => {
        const allProfiles = await this.config.profileStore.list();
        const profiles = Object.entries(allProfiles).map(([name, p]) => ({
          name,
          description: p.description,
          brain: p.brain,
          model: p.model,
        }));
        return {
          content: [{ type: "text" as const, text: JSON.stringify(profiles) }],
        };
      },
    );
  }

  async start(): Promise<string> {
    this.httpServer = Bun.serve({
      port: 0,
      fetch: async (req) => {
        this.config.logger.debug(
          { method: req.method, url: req.url },
          "MCP HTTP request",
        );
        try {
          const sessionId = req.headers.get("mcp-session-id");

          if (sessionId) {
            const existing = this.activeTransports.get(sessionId);
            if (existing) {
              return await existing.handleRequest(req);
            }
            return new Response("Session not found", { status: 404 });
          }

          const transport = await this.createSessionHandler();
          return await transport.handleRequest(req);
        } catch (err) {
          this.config.logger.error({ err }, "MCP HTTP error");
          return new Response("Internal Server Error", { status: 500 });
        }
      },
    });

    const url = `http://localhost:${this.httpServer.port}`;
    this.config.logger.info({ url }, "MCP server started");
    return url;
  }

  async stop(): Promise<void> {
    this.httpServer?.stop();
    this.config.logger.info("MCP server stopped");
  }
}
