/**
 * Command handling logic for all Chimp commands
 */
import * as path from "node:path";
import { ChimpNaming } from "@mnke/circus-shared/chimp-naming";
import { createLogger } from "@mnke/circus-shared/logger";
import {
  type ChimpCommand,
  type ChimpOutputMessage,
  createAgentMessageResponse,
  createLogMessage,
  createSaveSessionResponse,
  createStatusResponse,
  extractPrompt,
} from "@mnke/circus-shared/protocol";
import type { NatsConnection } from "nats";
import { processWithClaude } from "./agent";
import { publishJson } from "./nats-utils";
import {
  restoreClaudeStateFromS3,
  saveClaudeStateToS3,
} from "./session-storage";
import type { AppState } from "./types";

const logger = createLogger("Chimp");

/**
 * Handle commands and return appropriate response
 */
export async function handleCommand(
  command: ChimpCommand,
  state: AppState,
  nc: NatsConnection,
  chimpName: string,
): Promise<ChimpOutputMessage | null> {
  logger.info({ command: command.command }, "Handling command");

  const outputSubject = ChimpNaming.outputSubject(chimpName);

  switch (command.command) {
    case "send-agent-message": {
      const userPrompt = extractPrompt(command);
      logger.info({ userPrompt }, "User prompt");

      // Process with Claude Agent SDK
      const { response, sessionId } = await processWithClaude(
        userPrompt,
        state,
        nc,
        chimpName,
      );

      logger.info("Claude response received");
      logger.info({ sessionId }, "Session ID");

      // Update state
      state.sessionId = sessionId;
      state.messageCount++;

      return createAgentMessageResponse(response, sessionId);
    }

    case "get-status":
      return createStatusResponse({
        sessionId: state.sessionId,
        messageCount: state.messageCount,
        model: state.model,
      });

    case "new-session":
      state.sessionId = undefined;
      logger.info("Will create new session on next agent message");
      publishJson(
        nc,
        outputSubject,
        createLogMessage(
          "info",
          "Session mode set to new - next message will start new session",
        ),
      );
      return null;

    case "fork-session":
      throw new Error("fork-session command not yet implemented");

    case "stop":
      // Stop command doesn't return a response - it triggers shutdown
      logger.info("Stop command received, shutting down...");
      return null;

    case "clone-repo": {
      const { url, branch, path: targetPath } = command.args;

      publishJson(
        nc,
        outputSubject,
        createLogMessage("info", `Cloning repository: ${url}`),
      );

      // Build git clone command arguments as array (safe from shell injection)
      const repoPath =
        targetPath || url.split("/").pop()?.replace(".git", "") || "repo";
      const gitArgs = ["clone"];

      if (branch) {
        gitArgs.push("--branch", branch);
      }

      gitArgs.push(url, repoPath);

      try {
        const proc = Bun.spawn(["git", ...gitArgs], {
          stdout: "pipe",
          stderr: "pipe",
        });

        const exitCode = await proc.exited;

        if (exitCode !== 0) {
          const stderr = await new Response(proc.stderr).text();
          throw new Error(`Git clone failed: ${stderr}`);
        }

        // Get the actual branch name (might be default branch if not specified)
        const getBranchProc = Bun.spawn(
          ["git", "rev-parse", "--abbrev-ref", "HEAD"],
          {
            cwd: repoPath,
            stdout: "pipe",
          },
        );

        const actualBranch = (
          await new Response(getBranchProc.stdout).text()
        ).trim();

        publishJson(
          nc,
          outputSubject,
          createLogMessage(
            "info",
            `Repository cloned successfully to ${repoPath} (branch: ${actualBranch})`,
          ),
        );

        return null;
      } catch (error) {
        throw new Error(
          `Failed to clone repository: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    case "set-working-dir": {
      const { path: inputPath } = command.args;

      try {
        // Normalize to absolute path
        const absolutePath = path.isAbsolute(inputPath)
          ? inputPath
          : path.resolve(state.workingDir, inputPath);

        // Update state with new working directory
        state.workingDir = absolutePath;

        publishJson(
          nc,
          outputSubject,
          createLogMessage("info", `Working directory set to: ${absolutePath}`),
        );

        return null;
      } catch (error) {
        throw new Error(
          `Failed to set working directory: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    case "set-model":
      state.model = command.args.model;
      publishJson(
        nc,
        outputSubject,
        createLogMessage("info", `Model set to: ${command.args.model}`),
      );
      return null;

    case "set-allowed-tools":
      state.allowedTools = command.args.tools;
      publishJson(
        nc,
        outputSubject,
        createLogMessage(
          "info",
          `Allowed tools set to: ${command.args.tools.join(", ")}`,
        ),
      );
      return null;

    case "save-session": {
      if (!state.sessionId) {
        throw new Error("No active session to save");
      }

      publishJson(
        nc,
        outputSubject,
        createLogMessage("info", `Saving Claude state for ${chimpName} to S3`),
      );

      try {
        const s3Path = await saveClaudeStateToS3(chimpName);

        publishJson(
          nc,
          outputSubject,
          createLogMessage(
            "info",
            `Claude state saved successfully to ${s3Path}`,
          ),
        );

        return createSaveSessionResponse(s3Path, state.sessionId);
      } catch (error) {
        throw new Error(
          `Failed to save Claude state: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    case "restore-session": {
      // Note: sessionId arg is ignored now, we restore based on chimp name
      publishJson(
        nc,
        outputSubject,
        createLogMessage(
          "info",
          `Restoring Claude state for ${chimpName} from S3`,
        ),
      );

      try {
        await restoreClaudeStateFromS3(chimpName);

        publishJson(
          nc,
          outputSubject,
          createLogMessage(
            "info",
            `Claude state restored successfully from S3`,
          ),
        );

        return null;
      } catch (error) {
        throw new Error(
          `Failed to restore Claude state: ${error instanceof Error ? error.message : "Unknown error"}`,
        );
      }
    }

    default: {
      // TypeScript will error if we miss a case
      const _exhaustive: never = command;
      throw new Error(`Unknown command: ${(command as any).command}`);
    }
  }
}
