import path from "node:path";
import { Protocol } from "@mnke/circus-shared";
import type {
  ProfileStore,
  TopicRegistry,
} from "@mnke/circus-shared/components";
import { Typing } from "@mnke/circus-shared/lib";
import type * as Logger from "@mnke/circus-shared/logger";
import type { StoredEventContext } from "@/chimp-brain/event-contexts";
import { Tooling } from "@/lib";

export type PublishFn = (message: Protocol.ChimpOutputMessage) => void;
export type CommandResult = "continue" | "stop";

export abstract class ChimpBrain {
  protected chimpId: string;
  protected model: string;
  protected systemPrompt: string | undefined;
  protected allowedTools: string[] = [];
  protected workingDir: string = process.cwd();
  protected publish: PublishFn;
  protected logger: Logger.Logger;
  protected mcpUrl: string;
  protected profileStore: ProfileStore | null = null;
  protected topicRegistry: TopicRegistry | null = null;

  /**
   * Fires whenever the brain's recorded event-context list changes
   * (restore on startup or a new context appended). The chimp layer
   * uses this to sync the list into the MCP server so the agent can
   * query it via `list_event_contexts`.
   */
  onEventContextsChanged?: (list: StoredEventContext[]) => void;

  /**
   * Subclasses override to persist every event context the chimp has seen,
   * so later turns can respond on channels other than the one that
   * triggered the current turn. Default is a no-op — brains that don't
   * support cross-channel responses (echo, opencode) can leave it.
   */
  protected recordEventContext(_ctx: Protocol.EventContext): void {}

  constructor(
    chimpId: string,
    model: string,
    publish: PublishFn,
    logger: Logger.Logger,
    mcpUrl: string,
  ) {
    this.chimpId = chimpId;
    this.model = model;
    this.publish = publish;
    this.logger = logger;
    this.mcpUrl = mcpUrl;
  }

  setProfileStore(profileStore: ProfileStore): void {
    this.profileStore = profileStore;
  }

  setTopicRegistry(topicRegistry: TopicRegistry): void {
    this.topicRegistry = topicRegistry;
  }

  protected log(
    level: Logger.LogLevel,
    message: string,
    data?: Record<string, unknown>,
  ): void {
    if (data) {
      this.logger[level](data, message);
    } else {
      this.logger[level](message);
    }
  }

  async handleCommand(command: Protocol.ChimpCommand): Promise<CommandResult> {
    this.publish(Protocol.createCommandReceived(command));

    switch (command.command) {
      case "send-agent-message":
        if (command.args.context) {
          this.recordEventContext(command.args.context);
        }
        return this.handlePrompt(command.args.prompt);
      case "stop":
        return this.handleStop();
      case "clone-repo":
        return this.handleCloneRepo(
          command.args.url,
          command.args.path,
          command.args.branch,
        );
      case "gh-clone-repo":
        return this.handleGhCloneRepo(
          command.args.repo,
          command.args.path,
          command.args.branch,
        );
      case "set-working-dir":
        return this.handleSetWorkingDir(command.args.path);
      case "set-system-prompt":
        return this.handleSetSystemPrompt(command.args.prompt);
      case "append-system-prompt":
        return this.handleAppendSystemPrompt(command.args.prompt);
      case "set-allowed-tools":
        return this.handleSetAllowedTools(command.args.tools);
      case "setup-github-auth":
        return this.handleSetupGithubAuth();
      case "subscribe-topic":
        return this.handleSubscribeTopic(command.args.topic);
      case "unsubscribe-topic":
        return this.handleUnsubscribeTopic(command.args.topic);
      case "add-event-context":
        return this.handleAddEventContext(command.args.context);
      default:
        return Typing.unreachable(command);
    }
  }

  abstract handlePrompt(prompt: string): Promise<CommandResult>;

  protected async handleStop(): Promise<CommandResult> {
    this.log("info", "Stop command received");
    await this.gracefulShutdown();
    return "stop";
  }

  protected async handleCloneRepo(
    url: string,
    targetPath?: string,
    branch?: string,
  ): Promise<CommandResult> {
    this.log("info", `Cloning repository: ${url}`);
    const { repoPath, branch: actualBranch } = await Tooling.cloneRepo(
      url,
      targetPath,
      branch,
    );
    this.log(
      "info",
      `Repository cloned successfully to ${repoPath} (branch: ${actualBranch})`,
    );
    return "continue";
  }

  protected async handleGhCloneRepo(
    repo: string,
    targetPath?: string,
    branch?: string,
  ): Promise<CommandResult> {
    this.log("info", `Cloning repository via gh: ${repo}`);
    const { repoPath, branch: actualBranch } = await Tooling.ghCloneRepo(
      repo,
      targetPath,
      branch,
    );
    this.log(
      "info",
      `Repository cloned successfully to ${repoPath} (branch: ${actualBranch})`,
    );
    return "continue";
  }

  protected async handleSetWorkingDir(
    inputPath: string,
  ): Promise<CommandResult> {
    const absolutePath = path.isAbsolute(inputPath)
      ? inputPath
      : path.resolve(inputPath);
    this.workingDir = absolutePath;
    this.log("info", `Working directory set to: ${absolutePath}`);
    return "continue";
  }

  protected handleSetSystemPrompt(prompt: string): CommandResult {
    this.systemPrompt = prompt;
    this.log("info", "System prompt set");
    return "continue";
  }

  protected handleAppendSystemPrompt(prompt: string): CommandResult {
    this.systemPrompt = `${this.systemPrompt ?? ""}\n\n${prompt}`.trim();
    this.log("info", "System prompt appended");
    return "continue";
  }

  protected handleSetAllowedTools(tools: string[]): CommandResult {
    this.allowedTools = tools;
    this.log("info", "Allowed tools set", { tools });
    return "continue";
  }

  protected async handleSetupGithubAuth(): Promise<CommandResult> {
    await Tooling.setupGithubAuth(this.logger);
    return "continue";
  }

  protected async handleSubscribeTopic(
    topic: Parameters<TopicRegistry["subscribe"]>[0],
  ): Promise<CommandResult> {
    if (!this.topicRegistry) {
      this.log("warn", "TopicRegistry not available for subscribe-topic");
      return "continue";
    }

    await this.topicRegistry.subscribe(topic, this.chimpId);
    this.log("info", "Subscribed to topic via command", { topic });
    return "continue";
  }

  protected async handleUnsubscribeTopic(
    topic: Parameters<TopicRegistry["unsubscribe"]>[0],
  ): Promise<CommandResult> {
    if (!this.topicRegistry) {
      this.log("warn", "TopicRegistry not available for unsubscribe-topic");
      return "continue";
    }

    await this.topicRegistry.unsubscribe(topic, this.chimpId);
    this.log("info", "Unsubscribed from topic via command", { topic });
    return "continue";
  }

  protected handleAddEventContext(
    context: Protocol.EventContext,
  ): CommandResult {
    this.recordEventContext(context);
    this.log("info", "Added event context via command", {
      source: context.source,
    });
    return "continue";
  }

  protected async gracefulShutdown(): Promise<void> {}

  protected restoreEventContexts(contexts: StoredEventContext[]): void {
    this.onEventContextsChanged?.(contexts);
  }

  abstract onStartup(): Promise<void>;
  abstract onShutdown(): Promise<void>;
}
