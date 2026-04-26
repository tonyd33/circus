import type { AuthResolver } from "@mnke/circus-shared/components";
import type * as Logger from "@mnke/circus-shared/logger";
import type { ChimpBrain, PublishFn } from "./chimp-brain";
import { ClaudeChimp } from "./claude/claude-brain";
import { EchoBrain } from "./echo/echo-brain";
import { OpencodeBrain } from "./opencode/opencode-brain";

type BrainType = "claude" | "opencode" | "echo";

export interface BrainFactory {
  create(
    chimpId: string,
    provider: string,
    model: string,
    publish: PublishFn,
    logger: Logger.Logger,
    mcpUrl: string,
    authResolver: AuthResolver,
  ): ChimpBrain;
}

export class DefaultBrainFactory implements BrainFactory {
  constructor(private brainType: BrainType) {}

  create(
    chimpId: string,
    provider: string,
    model: string,
    publish: PublishFn,
    logger: Logger.Logger,
    mcpUrl: string,
    authResolver: AuthResolver,
  ): ChimpBrain {
    switch (this.brainType) {
      case "claude":
        return new ClaudeChimp(
          chimpId,
          provider,
          model,
          publish,
          logger,
          mcpUrl,
          authResolver,
        );
      case "opencode":
        return new OpencodeBrain(
          chimpId,
          provider,
          model,
          publish,
          logger,
          mcpUrl,
          authResolver,
        );
      case "echo":
        return new EchoBrain(
          chimpId,
          provider,
          model,
          publish,
          logger,
          mcpUrl,
          authResolver,
        );
    }
  }
}
