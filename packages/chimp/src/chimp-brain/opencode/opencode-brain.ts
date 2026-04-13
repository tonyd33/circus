/**
 * OpencodeBrain - Chimp powered by Opencode SDK
 */

import * as path from "node:path";
import type { S3Client } from "@aws-sdk/client-s3";
import { EnvReader as ER, Typing } from "@mnke/circus-shared/lib";
import { Either as E } from "@mnke/circus-shared/lib/fp";
import {
  type ChimpCommand,
  createAgentMessageResponse,
  createOpencodeEventMessage,
} from "@mnke/circus-shared/protocol";
import * as Opencode from "@opencode-ai/sdk";
import { ChimpBrain, type PublishFn } from "@/chimp-brain";
import {
  restoreOpencodeChimpStateFromS3,
  restoreOpencodeStateFromS3,
  saveOpencodeChimpStateToS3,
  saveOpencodeStateToS3,
} from "@/chimp-brain/opencode/session-storage";
import { createS3Client, s3ConfigReader } from "@/lib/s3";
import { cloneRepo } from "@/lib/tooling";

export class OpencodeBrain extends ChimpBrain {
  private opencode: Awaited<ReturnType<typeof Opencode.createOpencode>> | null =
    null;
  private client: Opencode.OpencodeClient | null = null;
  private sessionId: string | null = null;
  private workingDir = process.cwd();
  private eventAbortController: AbortController | null = null;
  private s3Client: S3Client | null = null;
  private s3Bucket: string | null = null;

  private async bindEventSubscription(directory: string): Promise<void> {
    if (this.eventAbortController) {
      this.eventAbortController.abort();
      this.eventAbortController = null;
    }

    if (!this.client) return;

    this.eventAbortController = new AbortController();

    const events = await this.client.event.subscribe({
      query: { directory },
      signal: this.eventAbortController.signal,
    });

    (async () => {
      try {
        for await (const event of events.stream) {
          if (this.eventAbortController?.signal.aborted) break;
          this.publish(createOpencodeEventMessage(event));
        }
      } catch (err) {
        if ((err as Error).name === "AbortError") {
          this.log("debug", "Event subscription cancelled");
        } else {
          this.log("error", "Event stream error", { err });
        }
      }
    })();
  }

  async onStartup(): Promise<void> {
    this.log("info", "OpencodeBrain starting up", { chimpId: this.chimpId });

    // Read S3 config from env
    const s3Result = s3ConfigReader.read(process.env).value;
    if (E.isLeft(s3Result)) {
      this.log("error", ER.formatReadError(s3Result.value));
      throw new Error("S3 configuration missing");
    }
    const s3Config = s3Result.value;
    this.s3Client = createS3Client(s3Config);
    this.s3Bucket = s3Config.bucket;

    // Restore opencode data dir from S3 before starting server
    try {
      await restoreOpencodeStateFromS3(
        this.s3Client,
        this.s3Bucket,
        this.chimpId,
      );
      this.log("info", "Opencode state restored from S3");
    } catch {
      this.log("warn", "No existing opencode state found, starting fresh");
    }

    // Restore chimp metadata (workingDir, sessionId)
    let savedSessionId: string | null = null;
    try {
      const savedState = await restoreOpencodeChimpStateFromS3(
        this.s3Client,
        this.s3Bucket,
        this.chimpId,
      );
      if (savedState) {
        this.workingDir = savedState.workingDir;
        savedSessionId = savedState.sessionId;
        this.log("info", "Chimp state restored from S3", {
          workingDir: this.workingDir,
          savedSessionId,
        });
      }
    } catch {
      this.log("warn", "Could not restore chimp state, using defaults");
    }

    const opencode = await Opencode.createOpencode({});

    this.opencode = opencode;
    this.client = opencode.client;

    const sessionTitle = `Chimp ${this.chimpId} session`;

    // Prefer resuming by saved session ID (exact match, no duplicate risk).
    // Fall back to creating a new session if the ID is gone.
    if (savedSessionId !== null) {
      try {
        const getResult = await this.client.session.get({
          path: { id: savedSessionId },
          throwOnError: true,
        });
        this.sessionId = getResult.data.id;
        this.log("info", "Resumed existing session by ID", {
          sessionId: this.sessionId,
        });
      } catch {
        this.log(
          "warn",
          "Saved session ID no longer valid, creating new session",
          {
            savedSessionId,
          },
        );
        const createResult = await this.client.session.create({
          body: { title: sessionTitle },
          throwOnError: true,
        });
        this.sessionId = createResult.data.id;
        this.log("info", "Created new session", { sessionId: this.sessionId });
      }
    } else {
      const createResult = await this.client.session.create({
        body: { title: sessionTitle },
        throwOnError: true,
      });
      this.sessionId = createResult.data.id;
      this.log("info", "Created new session", { sessionId: this.sessionId });
    }

    await this.bindEventSubscription(this.workingDir);

    this.log("info", "Opencode server started", {
      serverUrl: opencode.server.url,
    });
  }

  async onShutdown(): Promise<void> {
    this.log("info", "OpencodeBrain shutting down", { chimpId: this.chimpId });

    if (this.eventAbortController) {
      this.eventAbortController.abort();
      this.eventAbortController = null;
    }

    if (this.opencode) {
      this.opencode.server.close();
      this.log("info", "Opencode server closed");
    }

    // Save state to S3 after server closed so SQLite is flushed
    if (this.s3Client && this.s3Bucket) {
      try {
        await saveOpencodeChimpStateToS3(
          this.s3Client,
          this.s3Bucket,
          this.chimpId,
          {
            sessionId: this.sessionId,
            workingDir: this.workingDir,
          },
        );
        this.log("info", "Chimp state saved to S3");

        await saveOpencodeStateToS3(this.s3Client, this.s3Bucket, this.chimpId);
        this.log("info", "Opencode state saved to S3");
      } catch (error) {
        this.log("error", "Failed to save state", { err: error });
      }
    }
  }

  async handleMessage(command: ChimpCommand): Promise<"continue" | "stop"> {
    this.log("info", "Handling command", { command: command.command });

    if (this.client == null || this.sessionId == null) {
      throw new Error("Opencode client not initialized");
    }

    switch (command.command) {
      case "send-agent-message": {
        const userPrompt = command.args.prompt;
        const { data } = await this.client.session.prompt({
          path: { id: this.sessionId },
          query: {
            directory: this.workingDir,
          },
          body: {
            parts: [{ type: "text", text: userPrompt }],
            model: {
              providerID: "opencode",
              modelID: "big-pickle",
            },
          },
          throwOnError: true,
        });
        const texts = data.parts
          .flatMap((part) => (part.type === "text" ? [part.text] : []))
          .join("\n");

        this.publish(createAgentMessageResponse(texts, this.sessionId));
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
        await this.bindEventSubscription(absolutePath);

        this.log("info", `Working directory set to: ${absolutePath}`);
        break;
      }

      default:
        Typing.unreachable(command);
    }

    return "continue";
  }
}
