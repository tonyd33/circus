/**
 * OpencodeBrain - Chimp powered by Opencode SDK
 */

import * as path from "node:path";
import { Typing } from "@mnke/circus-shared/lib";
import { Either as E } from "@mnke/circus-shared/lib/fp";
import {
  type ChimpCommand,
  createAgentMessageResponse,
  createOpencodeEventMessage,
} from "@mnke/circus-shared/protocol";
import * as Opencode from "@opencode-ai/sdk";
import { ChimpBrain, type PublishFn } from "@/chimp-brain";
import { cloneRepo } from "@/lib/tooling";

export class OpencodeBrain extends ChimpBrain {
  private opencode: Awaited<ReturnType<typeof Opencode.createOpencode>> | null =
    null;
  private client: Opencode.OpencodeClient | null = null;
  private sessionId: string | null = null;
  private workingDir = process.cwd();
  private eventAbortController: AbortController | null = null;

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
          this.publish(createOpencodeEventMessage(event), false);
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

    const opencode = await Opencode.createOpencode({});

    this.opencode = opencode;
    this.client = opencode.client;

    const createResult = await this.client.session.create({
      body: { title: `Chimp ${this.chimpId} session` },
      throwOnError: true,
    });
    this.sessionId = createResult.data.id;

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
