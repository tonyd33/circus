import { type Logger, Protocol, Standards } from "@mnke/circus-shared";
import type { TopicRegistry } from "@mnke/circus-shared/lib";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { WebStandardStreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/webStandardStreamableHttp.js";
import Redis from "ioredis";
import type { NatsConnection } from "nats";
import { z } from "zod";
import type { StoredEventContext } from "@/chimp-brain/event-contexts";

type PublishFn = (message: Protocol.ChimpOutputMessage) => void;

export interface CircusMcpConfig {
  publish: PublishFn;
  chimpId: string;
  profile: string;
  redisUrl: string;
  topicRegistry: TopicRegistry | null;
  nc: NatsConnection | null;
  logger: Logger.Logger;
}

export class CircusMcp {
  private mcpServer: McpServer;
  private transport: WebStandardStreamableHTTPServerTransport;
  private eventContext: Protocol.EventContext | undefined;
  private eventContexts: StoredEventContext[] = [];
  private httpServer: ReturnType<typeof Bun.serve> | null = null;
  private redis: Redis;
  private config: CircusMcpConfig;

  constructor(config: CircusMcpConfig) {
    this.config = config;
    this.redis = new Redis(config.redisUrl);

    this.mcpServer = new McpServer({
      name: "circus",
      version: "0.1.0",
    });

    this.transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
    });

    this.registerTools();
  }

  setEventContext(context: Protocol.EventContext | undefined): void {
    this.eventContext = context;
  }

  setEventContexts(list: StoredEventContext[]): void {
    this.eventContexts = list;
  }

  private registerTools(): void {
    const { publish } = this.config;

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

    this.mcpServer.tool(
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

    this.mcpServer.tool(
      "respond",
      "Send a response back to the originating platform (Discord, GitHub, dashboard, etc.)",
      {
        content: z.string().describe("Response content to send"),
      },
      async (args) => {
        const ctx = this.eventContext;
        this.config.logger.info(
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
            this.config.logger.warn(
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

    this.mcpServer.tool(
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

        const success = await topicRegistry.subscribe(topic, chimpId, profile);
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

        // Update event consumer to include new topic filter
        const filterSubject = Standards.Topic.topicToEventSubject(topic);
        try {
          const jsm = await nc.jetstreamManager();
          const streamName = Standards.Chimp.Naming.eventsStreamName();
          const consumerName =
            Standards.Chimp.Naming.eventConsumerName(chimpId);

          const info = await jsm.consumers.info(streamName, consumerName);
          const existing = info.config.filter_subjects ?? [];
          if (!existing.includes(filterSubject)) {
            await jsm.consumers.update(streamName, consumerName, {
              filter_subjects: [...existing, filterSubject],
            });
          }
        } catch (err) {
          logger.error(
            { err, filterSubject },
            "Failed to update consumer filter",
          );
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

    this.mcpServer.tool(
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

    this.mcpServer.tool(
      "list_profiles",
      "List available chimp profiles with descriptions, brain type, and model. Use to decide which profile to transmogrify into.",
      {},
      async () => {
        const keys = await this.redis.keys(
          Standards.Chimp.Naming.redisProfilePattern(),
        );
        const profiles: {
          name: string;
          description?: string;
          brain: string;
          model: string;
        }[] = [];
        for (const key of keys) {
          const data = await this.redis.get(key);
          if (!data) continue;
          const parsed = Protocol.ChimpProfileSchema.safeParse(
            JSON.parse(data),
          );
          if (!parsed.success) continue;
          const name = key.replace("profile:", "");
          profiles.push({
            name,
            description: parsed.data.description,
            brain: parsed.data.brain,
            model: parsed.data.model,
          });
        }
        return {
          content: [{ type: "text" as const, text: JSON.stringify(profiles) }],
        };
      },
    );
  }

  async start(): Promise<string> {
    await this.mcpServer.connect(this.transport);

    this.httpServer = Bun.serve({
      port: 0,
      fetch: async (req) => {
        this.config.logger.debug(
          { method: req.method, url: req.url },
          "MCP HTTP request",
        );
        try {
          const res = await this.transport.handleRequest(req);
          this.config.logger.debug({ status: res.status }, "MCP HTTP response");
          return res;
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
    await this.mcpServer.close();
    await this.redis.quit();
    this.config.logger.info("MCP server stopped");
  }
}
