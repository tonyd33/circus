/**
 * Configuration loading and initialization
 */
import { createLogger } from "@mnke/circus-shared/logger";
import type { InitConfig } from "./types";

const logger = createLogger("Chimp");

/**
 * Load initialization configuration from disk
 * Looks for config in the following order:
 * 1. Path specified in CHIMP_CONFIG_PATH environment variable
 * 2. /etc/chimp/config.json (standard mount point)
 * 3. ./chimp.config.json (current directory)
 *
 * Returns null if no configuration file is found.
 */
export async function loadInitConfig(): Promise<InitConfig | null> {
  const configPaths = [
    process.env.CHIMP_CONFIG_PATH,
    "/etc/chimp/config.json",
    "./chimp.config.json",
  ].filter((p): p is string => p != null);

  for (const configPath of configPaths) {
    try {
      const file = Bun.file(configPath);
      if (await file.exists()) {
        const content = await file.text();
        const config = JSON.parse(content) as InitConfig;

        logger.info({ configPath }, "Loaded initialization configuration");
        return config;
      }
    } catch (error) {
      logger.warn(
        { configPath, err: error },
        "Failed to load initialization configuration",
      );
    }
  }

  logger.info("No initialization configuration found, starting with defaults");
  return null;
}

/**
 * Get the default application state from environment variables
 */
export function getDefaultState() {
  return {
    messageCount: 0,
    sessionId: undefined,
    model: process.env.CLAUDE_MODEL || "claude-sonnet-4-5",
    allowedTools: process.env.ALLOWED_TOOLS
      ? process.env.ALLOWED_TOOLS.split(",").map((t) => t.trim())
      : ["Read", "Glob", "Grep", "Write", "Edit", "Bash"],
    workingDir: process.env.WORKING_DIR || process.cwd(),
  };
}
