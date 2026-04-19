/**
 * ClaudeChimp - A Chimp implementation powered by Claude Agent SDK
 */

import * as path from "node:path";
import type { S3Client } from "@aws-sdk/client-s3";
import { Protocol } from "@mnke/circus-shared";
import { EnvReader as ER, Typing } from "@mnke/circus-shared/lib";
import { Either as E } from "@mnke/circus-shared/lib/fp";
import {
  restoreChimpStateFromS3,
  restoreClaudeStateFromS3,
  saveChimpStateToS3,
  saveClaudeStateToS3,
} from "@/chimp-brain/claude/session-storage";
import { createS3Client, s3ConfigReader } from "@/lib/s3";
import { cloneRepo } from "@/lib/tooling";
import { ChimpBrain, type PublishFn } from "../chimp-brain";
import { processWithClaude } from "./agent";

export class ClaudeChimp extends ChimpBrain {
  private messageCount = 0;
  private sessionId?: string;
  private allowedTools: string[] = [];
  private workingDir = process.cwd();
  private s3Client: S3Client | null = null;
  private s3Bucket: string | null = null;

  async onStartup(): Promise<void> {
    this.log("info", "ClaudeChimp starting up", { chimpId: this.chimpId });

    const apiKeyResult = ER.str("ANTHROPIC_API_KEY").read(process.env).value;
    if (E.isLeft(apiKeyResult)) {
      this.log("error", ER.formatReadError(apiKeyResult.value));
      throw new Error("ANTHROPIC_API_KEY environment variable is required");
    }

    // Read S3 config from env
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
    } catch (error) {
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
        this.log("info", "Chimp state restored from S3", {
          sessionId: this.sessionId,
          workingDir: this.workingDir,
          messageCount: this.messageCount,
        });
      }
    } catch (error) {
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
        });
        this.log("info", "Chimp state saved to S3");

        await saveClaudeStateToS3(this.s3Client, this.s3Bucket, this.chimpId);
        this.log("info", "Claude state saved to S3");
      } catch (error) {
        this.log("error", "Failed to save state", { err: error });
      }
    }
  }

  async handleMessage(
    command: Protocol.ChimpCommand,
  ): Promise<"continue" | "stop"> {
    this.log("info", "Handling command", { command: command.command });

    switch (command.command) {
      case "send-agent-message": {
        const userPrompt = command.args.prompt;
        this.log("info", "User prompt", { userPrompt });

        const { response: agentResponse, sessionId } = await processWithClaude(
          userPrompt,
          {
            messageCount: this.messageCount,
            sessionId: this.sessionId,
            model: this.model,
            allowedTools: this.allowedTools,
            workingDir: this.workingDir,
          },
          this.publish,
          (level, message, data) => this.log(level, message, data),
        );

        this.log("info", "Claude response received");
        this.log("info", "Session ID", { sessionId });

        this.sessionId = sessionId;
        this.messageCount++;

        this.publish(
          Protocol.createAgentMessageResponse(agentResponse, sessionId),
        );
        break;
      }

      case "stop":
        this.log("info", "Stop command received");
        return "stop";

      case "clone-repo": {
        const { url, branch, path: targetPath } = command.args;
        this.log("info", `Cloning repository: ${url}`);
        const { repoPath, branch: actualBranch } = await cloneRepo(
          url,
          targetPath,
          branch,
        );
        this.log(
          "info",
          `Repository cloned successfully to ${repoPath} (branch: ${actualBranch})`,
        );
        break;
      }

      case "set-working-dir": {
        const { path: inputPath } = command.args;

        const absolutePath = path.isAbsolute(inputPath)
          ? inputPath
          : path.resolve(inputPath);

        this.workingDir = absolutePath;

        this.log("info", `Working directory set to: ${absolutePath}`);
        break;
      }

      default:
        Typing.unreachable(command);
    }

    return "continue";
  }
}
