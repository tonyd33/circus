/**
 * Regression tests for CircusMcp tool registration.
 *
 * PR D (#58): Confirms that the deprecated `respond` tool is gone and that
 * only the explicit per-platform response tools are advertised.
 */
import { describe, expect, mock, spyOn, test } from "bun:test";
import { Logger } from "@mnke/circus-shared";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";

// Prevent ioredis from opening a real TCP connection during tests.
mock.module("ioredis", () => ({
  default: class MockRedis {
    quit() {
      return Promise.resolve("OK");
    }
  },
}));

describe("CircusMcp", () => {
  describe("registerTools", () => {
    /**
     * Snapshot of every tool name registered by CircusMcp.  If you add or
     * remove a tool, update this list so the change is intentional and
     * visible in review.
     */
    test("registers exactly the expected set of tools", async () => {
      const { CircusMcp } = await import("./circus-mcp.ts");

      const toolSpy = spyOn(McpServer.prototype, "tool");

      new CircusMcp({
        publish: () => {},
        chimpId: "test-chimp",
        profile: "test-profile",
        redisUrl: "redis://localhost:9999",
        topicRegistry: null,
        nc: null,
        logger: Logger.noopLogger,
      });

      const registeredNames = toolSpy.mock.calls.map((call) => call[0]);

      const expectedTools = [
        "chimp_request",
        "list_event_contexts",
        "github_respond",
        "discord_respond",
        "dashboard_respond",
        "subscribe_topic",
        "transmogrify",
        "list_profiles",
      ];

      expect(registeredNames.sort()).toEqual(expectedTools.sort());

      toolSpy.mockRestore();
    });

    test("does not expose the legacy respond tool", async () => {
      const { CircusMcp } = await import("./circus-mcp.ts");

      const toolSpy = spyOn(McpServer.prototype, "tool");

      new CircusMcp({
        publish: () => {},
        chimpId: "test-chimp",
        profile: "test-profile",
        redisUrl: "redis://localhost:9999",
        topicRegistry: null,
        nc: null,
        logger: Logger.noopLogger,
      });

      const registeredNames = toolSpy.mock.calls.map((call) => call[0]);
      expect(registeredNames).not.toContain("respond");

      toolSpy.mockRestore();
    });
  });
});
