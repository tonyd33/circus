import { Protocol } from "@mnke/circus-shared";
import { EnvReader as ER } from "@mnke/circus-shared/lib";
import { Either as E } from "@mnke/circus-shared/lib/fp";
import * as Opencode from "@opencode-ai/sdk";
import { configReader, createS3Client, type S3Client } from "@/lib/s3";
import { ChimpBrain, type CommandResult } from "../chimp-brain";
import {
  restoreOpencodeChimpStateFromS3,
  restoreOpencodeStateFromS3,
  saveOpencodeChimpStateToS3,
  saveOpencodeStateToS3,
} from "./session-storage";

const IGNORED_EVENTS: Set<string> = new Set([
  "session.idle",
  "server.heartbeat",
]);

export class OpencodeBrain extends ChimpBrain {
  private opencode: Awaited<ReturnType<typeof Opencode.createOpencode>> | null =
    null;
  private client: Opencode.OpencodeClient | null = null;
  private sessionId: string | null = null;
  private eventAbortController: AbortController | null = null;
  private s3Client: S3Client | null = null;

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
          if (IGNORED_EVENTS.has(event.type)) continue;
          this.publish(Protocol.createThought("opencode", event));
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

    const s3Result = configReader.read(process.env).value;
    if (E.isLeft(s3Result)) {
      this.log("error", ER.formatReadError(s3Result.value));
      throw new Error("S3 configuration missing");
    }
    this.s3Client = createS3Client(s3Result.value);

    try {
      await restoreOpencodeStateFromS3(this.s3Client, this.chimpId);
      this.log("info", "Opencode state restored from S3");
    } catch {
      this.log("warn", "No existing opencode state found, starting fresh");
    }

    let savedSessionId: string | null = null;
    try {
      const savedState = await restoreOpencodeChimpStateFromS3(
        this.s3Client,
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
          { savedSessionId },
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

    await this.bindEventSubscription(this.workingDir ?? process.cwd());

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

    if (this.s3Client) {
      try {
        await saveOpencodeChimpStateToS3(this.s3Client, this.chimpId, {
          sessionId: this.sessionId,
          workingDir: this.workingDir,
        });
        this.log("info", "Chimp state saved to S3");

        await saveOpencodeStateToS3(this.s3Client, this.chimpId);
        this.log("info", "Opencode state saved to S3");
      } catch (error) {
        this.log("error", "Failed to save state", { err: error });
      }
    }
  }

  protected override async handleSetWorkingDir(
    inputPath: string,
  ): Promise<CommandResult> {
    const result = await super.handleSetWorkingDir(inputPath);
    await this.bindEventSubscription(this.workingDir ?? process.cwd());
    return result;
  }

  async handlePrompt(prompt: string): Promise<CommandResult> {
    if (this.client == null || this.sessionId == null) {
      throw new Error("Opencode client not initialized");
    }

    const { data } = await this.client.session.prompt({
      path: { id: this.sessionId },
      query: {
        directory: this.workingDir ?? process.cwd(),
      },
      body: {
        parts: [{ type: "text", text: prompt }],
        model: {
          providerID: "opencode",
          modelID: this.model,
        },
      },
      throwOnError: true,
    });
    const texts = data.parts
      .flatMap((part) => (part.type === "text" ? [part.text] : []))
      .join("\n");

    this.publish(Protocol.createAgentMessageResponse(texts, this.sessionId));

    return "continue";
  }
}
