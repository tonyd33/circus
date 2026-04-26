import { Protocol, Standards } from "@mnke/circus-shared";
import type {
  ProfileStore,
  TopicRegistry,
} from "@mnke/circus-shared/components";
import type * as Logger from "@mnke/circus-shared/logger";
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
      "Request creation of a new chimp agent with a specific profile. " +
        "Optionally hand off your current subscriptions and context to it " +
        "by providing reason and summary.",
      {
        profile: z.string().describe("Profile name for the new chimp"),
        chimpId: z.string().describe("Unique ID for the new chimp"),
        reason: z
          .string()
          .optional()
          .describe("Why the new chimp is being created (for handoff)"),
        summary: z
          .string()
          .optional()
          .describe("Summary of work so far (for handoff)"),
      },
      async (args) => {
        const { nc, chimpId, profile, topicRegistry, logger } = this.config;

        logger.info(
          {
            tool: "chimp_request",
            targetProfile: args.profile,
            targetChimpId: args.chimpId,
          },
          "MCP tool called: chimp_request",
        );

        // Publish chimp-request first so its NATS timestamp predates
        // the direct commands — ringmaster uses this timestamp as
        // startTime for the new consumer
        publish({
          type: "chimp-request",
          profile: args.profile,
          chimpId: args.chimpId,
        });

        // If reason+summary provided, send individual commands to
        // transfer subscriptions, event contexts, and work summary
        if (args.reason && args.summary && nc) {
          const directSubject = Standards.Chimp.Naming.directSubject(
            args.chimpId,
          );

          // Transfer topic subscriptions (skip direct topics — new chimp gets its own)
          const subscriptions = topicRegistry
            ? (await topicRegistry.listForChimp(chimpId)).filter(
                (t) => t.platform !== "direct",
              )
            : [];
          for (const topic of subscriptions) {
            nc.publish(
              directSubject,
              JSON.stringify({
                command: "subscribe-topic",
                args: { topic },
              }),
            );
          }

          // Transfer event contexts
          for (const stored of this.eventContexts) {
            nc.publish(
              directSubject,
              JSON.stringify({
                command: "add-event-context",
                args: { context: stored.context },
              }),
            );
          }

          // Send work summary as prompt
          const prompt = [
            `You are resuming work handed off from the "${profile}" profile.`,
            `Reason: ${args.reason}`,
            `Summary: ${args.summary}`,
            "Continue the work described above.",
          ].join("\n");
          nc.publish(
            directSubject,
            JSON.stringify(Protocol.createAgentCommand(prompt)),
          );

          logger.info(
            {
              targetChimpId: args.chimpId,
              subscriptionCount: subscriptions.length,
              eventContextCount: this.eventContexts.length,
            },
            "Sent handoff commands to new chimp",
          );
        }

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
        replyToCommentId: z
          .number()
          .optional()
          .describe("Comment ID to reply to (creates a threaded reply)"),
      },
      async (args) => {
        this.config.logger.info(
          {
            tool: "github_respond",
            repo: args.repo,
            issueNumber: args.issueNumber,
            replyToCommentId: args.replyToCommentId,
          },
          "MCP tool called: github_respond",
        );
        publish(
          Protocol.createGithubComment({
            installationId: args.installationId,
            repo: args.repo,
            issueNumber: args.issueNumber,
            content: args.content,
            in_reply_to_id: args.replyToCommentId,
          }),
        );
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

        await topicRegistry.subscribe(topic, chimpId);

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
      "unsubscribe_topic",
      "Unsubscribe from a topic so this chimp no longer receives events for it. Use after handing off work to another chimp.",
      {
        platform: z.literal("github").describe("Platform"),
        owner: z.string().describe("Repository owner"),
        repo: z.string().describe("Repository name"),
        type: z.enum(["pr", "issue"]).describe("PR or issue"),
        number: z.number().describe("PR/issue number"),
      },
      async (args) => {
        const topic: Standards.Topic.Topic = args;
        const { topicRegistry, nc, chimpId, logger } = this.config;

        if (!topicRegistry || !nc) {
          return {
            content: [
              {
                type: "text" as const,
                text: "Topic unsubscription unavailable (no NATS)",
              },
            ],
          };
        }

        await topicRegistry.unsubscribe(topic, chimpId);

        const topicKey = Standards.Topic.serializeTopic(topic);
        logger.info({ topic: topicKey, chimpId }, "Unsubscribed from topic");

        return {
          content: [
            { type: "text" as const, text: `Unsubscribed from ${topicKey}` },
          ],
        };
      },
    );

    server.tool(
      "list_profiles",
      "List available chimp profiles with descriptions, brain type, and model.",
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
        this.config.logger.info(
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
