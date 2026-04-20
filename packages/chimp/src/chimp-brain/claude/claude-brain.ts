import type { S3Client } from "@aws-sdk/client-s3";
import { Protocol } from "@mnke/circus-shared";
import { EnvReader as ER } from "@mnke/circus-shared/lib";
import { Either as E } from "@mnke/circus-shared/lib/fp";
import {
  restoreChimpStateFromS3,
  restoreClaudeStateFromS3,
  type StoredEventContext,
  saveChimpStateToS3,
  saveClaudeStateToS3,
} from "@/chimp-brain/claude/session-storage";
import { createS3Client, s3ConfigReader } from "@/lib/s3";
import { ChimpBrain, type CommandResult } from "../chimp-brain";
import { processWithClaude } from "./agent";

export class ClaudeChimp extends ChimpBrain {
  private messageCount = 0;
  private sessionId?: string;
  private s3Client: S3Client | null = null;
  private s3Bucket: string | null = null;
  protected eventContexts: StoredEventContext[] = [];

  async onStartup(): Promise<void> {
    this.log("info", "ClaudeChimp starting up", { chimpId: this.chimpId });

    const apiKeyResult = ER.record({
      apiKey: ER.str("ANTHROPIC_API_KEY").fallbackW(null),
      oauthToken: ER.str("CLAUDE_CODE_OAUTH_TOKEN").fallbackW(null),
    }).read(process.env).value;
    if (E.isLeft(apiKeyResult)) {
      this.log("error", ER.formatReadError(apiKeyResult.value));
      throw new Error(
        "ANTHROPIC_API_KEY or CLAUDE_CODE_OAUTH_TOKEN environment variable is required",
      );
    }

    const s3Result = s3ConfigReader.read(process.env).value;
    if (E.isLeft(s3Result)) {
      this.log("error", ER.formatReadError(s3Result.value));
      throw new Error("S3 configuration missing");
    }
    const s3Config = s3Result.value;
    this.s3Client = createS3Client(s3Config);
    this.s3Bucket = s3Config.bucket;

    try {
      await restoreClaudeStateFromS3(
        this.s3Client,
        this.s3Bucket,
        this.chimpId,
      );
      this.log("info", "Claude state restored from S3");
    } catch (_error) {
      this.log("warn", "No existing Claude state found, starting fresh");
    }

    try {
      const savedState = await restoreChimpStateFromS3(
        this.s3Client,
        this.s3Bucket,
        this.chimpId,
      );
      if (savedState) {
        this.sessionId = savedState.sessionId;
        this.workingDir = savedState.workingDir;
        this.messageCount = savedState.messageCount;
        this.model = savedState.model;
        this.allowedTools = savedState.allowedTools;
        this.eventContexts = savedState.eventContexts;
        this.log("info", "Chimp state restored from S3", {
          sessionId: this.sessionId,
          workingDir: this.workingDir,
          messageCount: this.messageCount,
          eventContextCount: this.eventContexts.length,
        });
      }
    } catch (_error) {
      this.log("warn", "Could not restore chimp state, using defaults");
    }
  }

  async onShutdown(): Promise<void> {
    this.log("info", "ClaudeChimp shutting down", { chimpId: this.chimpId });

    if (this.sessionId && this.s3Client && this.s3Bucket) {
      try {
        await saveChimpStateToS3(this.s3Client, this.s3Bucket, this.chimpId, {
          sessionId: this.sessionId,
          workingDir: this.workingDir,
          messageCount: this.messageCount,
          model: this.model,
          allowedTools: this.allowedTools,
          eventContexts: this.eventContexts,
        });
        this.log("info", "Chimp state saved to S3");

        await saveClaudeStateToS3(this.s3Client, this.s3Bucket, this.chimpId);
        this.log("info", "Claude state saved to S3");
      } catch (error) {
        this.log("error", "Failed to save state", { err: error });
      }
    }
  }

  async handlePrompt(prompt: string): Promise<CommandResult> {
    this.log("info", "User prompt", { userPrompt: prompt });

    const { response: agentResponse, sessionId } = await processWithClaude(
      prompt,
      {
        messageCount: this.messageCount,
        sessionId: this.sessionId,
        model: this.model,
        systemPrompt: this.systemPrompt,
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
    this.messageCount++;

    this.publish(Protocol.createAgentMessageResponse(agentResponse, sessionId));

    return "continue";
  }
}
