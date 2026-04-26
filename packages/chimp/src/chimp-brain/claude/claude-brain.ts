import { Protocol } from "@mnke/circus-shared";
import { EnvReader as ER } from "@mnke/circus-shared/lib";
import { Either as E } from "@mnke/circus-shared/lib/fp";
import {
  restoreChimpStateFromS3,
  restoreClaudeStateFromS3,
  saveChimpStateToS3,
  saveClaudeStateToS3,
} from "@/chimp-brain/claude/session-storage";
import {
  appendUniqueEventContext,
  composeSystemPromptWithEventContexts,
  type StoredEventContext,
} from "@/chimp-brain/event-contexts";
import { configReader, createS3Client, type S3Client } from "@/lib/s3";
import { ChimpBrain, type CommandResult } from "../chimp-brain";
import { processWithClaude } from "./agent";

export class ClaudeChimp extends ChimpBrain {
  private sessionId?: string;
  private s3Client: S3Client | null = null;
  protected eventContexts: StoredEventContext[] = [];

  async onStartup(): Promise<void> {
    this.log("info", "ClaudeChimp starting up", { chimpId: this.chimpId });

    const creds = await this.authResolver.resolveAll();
    if (creds.anthropic) {
      process.env.ANTHROPIC_API_KEY = creds.anthropic;
    }
    if (creds.claude) {
      process.env.CLAUDE_CODE_OAUTH_TOKEN = creds.claude;
    }

    const s3Result = configReader.read(process.env).value;
    if (E.isLeft(s3Result)) {
      this.log("error", ER.formatReadError(s3Result.value));
      throw new Error("S3 configuration missing");
    }
    this.s3Client = createS3Client(s3Result.value);

    await this.restoreState(this.s3Client);
  }

  private async restoreState(client: S3Client): Promise<void> {
    try {
      await restoreClaudeStateFromS3(client, this.chimpId);
      this.log("info", "Claude state restored from S3");

      const savedState = await restoreChimpStateFromS3(client, this.chimpId);
      if (savedState) {
        this.sessionId = savedState.sessionId;
        this.workingDir = savedState.workingDir;
        this.model = savedState.model;
        this.allowedTools = savedState.allowedTools;
        this.eventContexts = savedState.eventContexts;
        this.log("info", "Chimp state restored from S3", {
          sessionId: this.sessionId,
          workingDir: this.workingDir,
          eventContextCount: this.eventContexts.length,
        });
      }
    } catch (err) {
      this.log("warn", "Could not restore state from S3, starting fresh", {
        err,
      });
    }

    this.onEventContextsChanged?.(this.eventContexts);
  }

  async onShutdown(): Promise<void> {
    this.log("info", "ClaudeChimp shutting down", { chimpId: this.chimpId });

    if (this.sessionId && this.s3Client) {
      await this.saveState(this.s3Client, this.sessionId);
    }
  }

  private async saveState(client: S3Client, sessionId: string): Promise<void> {
    try {
      await saveChimpStateToS3(client, this.chimpId, {
        sessionId,
        workingDir: this.workingDir,
        model: this.model,
        allowedTools: this.allowedTools,
        eventContexts: this.eventContexts,
      });
      this.log("info", "Chimp state saved to S3");

      await saveClaudeStateToS3(client, this.chimpId);
      this.log("info", "Claude state saved to S3");
    } catch (error) {
      this.log("error", "Failed to save state", { err: error });
    }
  }

  async handlePrompt(prompt: string): Promise<CommandResult> {
    this.log("info", "User prompt", { userPrompt: prompt });

    const { response: agentResponse, sessionId } = await processWithClaude(
      prompt,
      {
        sessionId: this.sessionId,
        model: this.model,
        systemPrompt: this.composeSystemPrompt(),
        allowedTools: this.allowedTools,
        workingDir: this.workingDir,
        mcpUrl: this.mcpUrl,
      },
      this.publish,
      (level, message, data) => this.log(level, message, data),
    );

    this.log("info", "Claude response received");
    this.log("info", "Session ID", { sessionId });

    this.sessionId = sessionId;

    this.publish(Protocol.createAgentMessageResponse(agentResponse, sessionId));

    return "continue";
  }

  protected override restoreEventContexts(
    contexts: StoredEventContext[],
  ): void {
    this.eventContexts = contexts;
    this.onEventContextsChanged?.(this.eventContexts);
  }

  protected override recordEventContext(ctx: Protocol.EventContext): void {
    const next = appendUniqueEventContext(this.eventContexts, ctx);
    if (next === this.eventContexts) return;
    this.eventContexts = next;
    this.onEventContextsChanged?.(this.eventContexts);
  }

  protected composeSystemPrompt(): string | undefined {
    return composeSystemPromptWithEventContexts(
      this.systemPrompt,
      this.eventContexts,
    );
  }
}
