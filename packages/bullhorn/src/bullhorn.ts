import { type Logger, Protocol, Standards } from "@mnke/circus-shared";
import { Typing } from "@mnke/circus-shared/lib";
import {
  createMetrics,
  type ServiceMetrics,
} from "@mnke/circus-shared/metrics";
import { App } from "@octokit/app";
import { connect, type NatsConnection } from "nats";

export interface BullhornConfig {
  logger: Logger.Logger;
  natsUrl: string;
  githubAppId: string;
  githubPrivateKey: string;
  metricsPort?: number;
}

export class Bullhorn {
  private logger: Logger.Logger;
  private metrics: ServiceMetrics;
  private natsUrl: string;
  private githubApp: App;
  private nc: NatsConnection | null = null;

  constructor(config: BullhornConfig) {
    this.logger = config.logger;
    this.metrics = createMetrics({ serviceName: "bullhorn" });
    this.natsUrl = config.natsUrl;
    this.githubApp = new App({
      appId: config.githubAppId,
      privateKey: config.githubPrivateKey,
    });
  }

  async initialize(): Promise<void> {
    this.logger.info("Initializing Bullhorn...");

    this.nc = await connect({
      servers: this.natsUrl,
      maxReconnectAttempts: -1,
      reconnectTimeWait: 2000,
    });

    this.logger.info({ url: this.natsUrl }, "Connected to NATS");
    this.metrics.incActiveConnections("nats");
  }

  async start(): Promise<void> {
    if (!this.nc) {
      throw new Error("Bullhorn not initialized");
    }

    const sub = this.nc.subscribe("chimp.outputs.>");
    this.logger.info("Subscribed to chimp.outputs.>");

    (async () => {
      for await (const msg of sub) {
        const startTime = Date.now();
        try {
          const subject = msg.subject;
          this.metrics.recordNatsReceived(subject);

          const parsed = Standards.Chimp.Naming.parseOutputSubject(subject);
          if (parsed == null) {
            this.logger.warn({ subject }, "Invalid subject format");
            this.metrics.recordError("invalid_subject", "warning");
            continue;
          }

          const { profile, chimpId } = parsed;
          const rawMessage = msg.json();

          await this.handleMessage(profile, chimpId, rawMessage);
          this.publishMetaEvent(profile, chimpId);

          const duration = (Date.now() - startTime) / 1000;
          this.metrics.recordNatsProcessed(subject, true, duration);
        } catch (error) {
          this.logger.error({ err: error }, "Error processing output message");
          this.metrics.recordError("message_processing", "error");
          const duration = (Date.now() - startTime) / 1000;
          this.metrics.recordNatsProcessed(msg.subject, false, duration);
        }
      }
    })();

    this.logger.info("Bullhorn started");
    await new Promise(() => {});
  }

  private async handleMessage(
    profile: string,
    chimpId: string,
    raw: unknown,
  ): Promise<void> {
    const result = Protocol.safeParseChimpOutputMessage(raw);
    if (!result.success) {
      this.logger.error(
        { profile, chimpId, error: result.error },
        "Invalid output message",
      );
      return;
    }

    const msg = result.data;

    switch (msg.type) {
      case "agent-message-response":
        this.logger.info(
          { chimpId, sessionId: msg.sessionId },
          `[${chimpId}] ${msg.content.slice(0, 200)}`,
        );
        break;

      case "artifact":
        this.logger.info(
          { chimpId, artifactType: msg.artifactType, name: msg.name },
          `[${chimpId}] Artifact: ${msg.name}`,
        );
        break;

      case "progress":
        this.logger.info(
          { chimpId, percentage: msg.percentage },
          `[${chimpId}] ${msg.message}`,
        );
        break;

      case "log":
        this.logger[msg.level](
          { chimpId, ...msg.data },
          `[${chimpId}] ${msg.message}`,
        );
        break;

      case "error":
        this.logger.error(
          { chimpId, command: msg.command, details: msg.details },
          `[${chimpId}] Error: ${msg.error}`,
        );
        break;

      case "thought":
        this.logger.debug(
          { chimpId, brain: msg.brain },
          `[${chimpId}] Thought`,
        );
        break;

      case "chimp-request":
        if (this.nc) {
          const subject = Standards.Chimp.Naming.inputSubject(
            msg.profile,
            msg.chimpId,
          );
          this.nc.publish(
            subject,
            JSON.stringify(Protocol.createAgentCommand(msg.message)),
          );
          this.logger.info(
            { chimpId, targetChimpId: msg.chimpId, targetProfile: msg.profile },
            "Forwarded chimp request",
          );
        }
        break;

      case "discord-response":
        await this.handleDiscordResponse(msg);
        break;

      case "github-comment":
        await this.handleGithubComment(msg);
        break;

      default:
        Typing.unreachable(msg);
    }
  }

  private async handleDiscordResponse(
    msg: Protocol.ChimpOutputMessage & { type: "discord-response" },
  ): Promise<void> {
    const url = `https://discord.com/api/v10/webhooks/${msg.applicationId}/${msg.interactionToken}/messages/@original`;
    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: msg.content }),
      });
      if (!res.ok) {
        this.logger.error(
          { status: res.status, applicationId: msg.applicationId },
          "Failed to post Discord follow-up",
        );
      } else {
        this.logger.info(
          { applicationId: msg.applicationId },
          "Posted Discord follow-up",
        );
      }
    } catch (err) {
      this.logger.error({ err }, "Discord API error");
    }
  }

  private async handleGithubComment(
    msg: Protocol.ChimpOutputMessage & { type: "github-comment" },
  ): Promise<void> {
    const parts = msg.repo.split("/");
    const owner = parts[0] ?? "";
    const repo = parts[1] ?? "";

    if (!owner || !repo) {
      this.logger.error(
        { repo: msg.repo },
        "Invalid repo format, expected owner/repo",
      );
      return;
    }
    try {
      const octokit = await this.githubApp.getInstallationOctokit(
        msg.installationId,
      );
      const res = await octokit.request(
        "POST /repos/{owner}/{repo}/issues/{issue_number}/comments",
        {
          owner,
          repo,
          issue_number: msg.issueNumber,
          body: msg.content,
        },
      );
      this.logger.info(
        {
          repo: msg.repo,
          issueNumber: msg.issueNumber,
          commentId: res.data.id,
        },
        "Posted GitHub comment",
      );
    } catch (err) {
      this.logger.error(
        { err, repo: msg.repo, issueNumber: msg.issueNumber },
        "Failed to post GitHub comment",
      );
    }
  }

  private publishMetaEvent(profile: string, chimpId: string): void {
    if (!this.nc) return;

    const metaEvent: Protocol.MetaEvent = {
      type: "bullhorn-dispatched",
      profile,
      chimpId,
      timestamp: new Date().toISOString(),
    };

    const subject = Standards.Chimp.Naming.metaSubject(profile, chimpId);
    try {
      this.nc.publish(subject, JSON.stringify(metaEvent));
    } catch (error) {
      this.logger.error(
        { err: error, subject },
        "Failed to publish meta event",
      );
    }
  }

  async startMetricsServer(port = 9090): Promise<void> {
    Bun.serve({
      port,
      fetch: async (req) => {
        const url = new URL(req.url);
        if (url.pathname === "/metrics") {
          const metrics = await this.metrics.getMetrics();
          return new Response(metrics, {
            headers: { "Content-Type": this.metrics.getContentType() },
          });
        }
        if (url.pathname === "/healthz") {
          return new Response("OK", { status: 200 });
        }
        return new Response("Not Found", { status: 404 });
      },
    });
    this.logger.info({ port }, "Metrics server started");
  }

  async stop(): Promise<void> {
    if (this.nc) {
      await this.nc.close();
      this.metrics.decActiveConnections("nats");
    }
    this.logger.info("Bullhorn stopped");
  }
}
