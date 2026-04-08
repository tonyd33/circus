/**
 * Lifecycle hooks system for startup and shutdown
 */
import { createLogger } from "@mnke/circus-shared/logger";
import type { AppState } from "./types";

const logger = createLogger("Chimp");

/**
 * Context passed to lifecycle hooks
 */
export interface LifecycleContext {
  chimpName: string;
  state: AppState;
}

/**
 * Startup hook - runs during application initialization
 * Can modify the context (e.g., restore sessions, load config)
 */
export type StartupHook = (context: LifecycleContext) => Promise<void> | void;

/**
 * Shutdown hook - runs during application cleanup
 * Should clean up resources, save state, etc.
 */
export type ShutdownHook = (
  context: LifecycleContext,
  reason: "idle_timeout" | "explicit_stop" | "error",
) => Promise<void> | void;

/**
 * Lifecycle hooks manager
 */
export class LifecycleHooks {
  private startupHooks: Array<{ name: string; hook: StartupHook }> = [];
  private shutdownHooks: Array<{ name: string; hook: ShutdownHook }> = [];

  /**
   * Register a startup hook
   */
  registerStartup(name: string, hook: StartupHook): void {
    this.startupHooks.push({ name, hook });
    logger.debug({ hookName: name }, "Registered startup hook");
  }

  /**
   * Register a shutdown hook
   */
  registerShutdown(name: string, hook: ShutdownHook): void {
    this.shutdownHooks.push({ name, hook });
    logger.debug({ hookName: name }, "Registered shutdown hook");
  }

  /**
   * Execute all startup hooks in order
   */
  async executeStartup(context: LifecycleContext): Promise<void> {
    logger.info(
      { hookCount: this.startupHooks.length },
      "Executing startup hooks",
    );

    for (const { name, hook } of this.startupHooks) {
      try {
        logger.debug({ hookName: name }, "Executing startup hook");
        await hook(context);
        logger.debug({ hookName: name }, "Startup hook completed");
      } catch (error) {
        logger.error({ err: error, hookName: name }, "Startup hook failed");
        // Continue with other hooks even if one fails
      }
    }

    logger.info("All startup hooks completed");
  }

  /**
   * Execute all shutdown hooks in reverse order
   * (last registered runs first - LIFO)
   */
  async executeShutdown(
    context: LifecycleContext,
    reason: "idle_timeout" | "explicit_stop" | "error",
  ): Promise<void> {
    logger.info(
      { hookCount: this.shutdownHooks.length, reason },
      "Executing shutdown hooks",
    );

    // Execute in reverse order (LIFO)
    for (const { name, hook } of this.shutdownHooks.reverse()) {
      try {
        logger.debug({ hookName: name }, "Executing shutdown hook");
        await hook(context, reason);
        logger.debug({ hookName: name }, "Shutdown hook completed");
      } catch (error) {
        logger.error(
          { err: error, hookName: name },
          "Shutdown hook failed, continuing with remaining hooks",
        );
        // Continue with other hooks even if one fails
      }
    }

    logger.info("All shutdown hooks completed");
  }
}
