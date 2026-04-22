import { describe, expect, mock, test } from "bun:test";
import type { Logger } from "@mnke/circus-shared";
import { Protocol } from "@mnke/circus-shared";
import type { ProfileStore } from "@mnke/circus-shared/lib";
import { ChimpBrain, type CommandResult, type PublishFn } from "./chimp-brain";

// Create a concrete implementation of ChimpBrain for testing
class TestChimpBrain extends ChimpBrain {
  async handlePrompt(prompt: string): Promise<CommandResult> {
    return "continue";
  }

  async onStartup(): Promise<void> {}
  async onShutdown(): Promise<void> {}
}

// Mock Logger
const mockLogger: Logger.Logger = {
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
  debug: mock(() => {}),
  child: mock(() => mockLogger),
} as unknown as Logger.Logger;

// Mock PublishFn
const mockPublish: PublishFn = mock(() => {});

describe("ChimpBrain.handleResumeTransmogrify", () => {
  test("validates fromProfile when ProfileStore is available", async () => {
    const brain = new TestChimpBrain(
      "test-chimp",
      "test-model",
      mockPublish,
      mockLogger,
      "http://localhost:3000",
    );

    // Mock ProfileStore with a profile that exists
    const mockProfileStore = {
      get: mock(async (name: string) => {
        if (name === "scout") {
          return { name: "scout", initCommands: [] };
        }
        return null;
      }),
      save: mock(async () => {}),
      delete: mock(async () => false),
      list: mock(async () => ({})),
      seedDefaults: mock(async () => false),
    } as unknown as ProfileStore;

    brain.setProfileStore(mockProfileStore);

    const result = await brain.handleCommand({
      command: "resume-transmogrify",
      args: {
        fromProfile: "scout",
        reason: "test reason",
        summary: "test summary",
        eventContexts: [],
      },
    });

    expect(result).toBe("continue");
    expect(mockProfileStore.get).toHaveBeenCalledWith("scout");
  });

  test("logs warning when fromProfile does not exist in ProfileStore", async () => {
    const brain = new TestChimpBrain(
      "test-chimp",
      "test-model",
      mockPublish,
      mockLogger,
      "http://localhost:3000",
    );

    // Mock ProfileStore that returns null (profile doesn't exist)
    const mockProfileStore = {
      get: mock(async () => null),
      save: mock(async () => {}),
      delete: mock(async () => false),
      list: mock(async () => ({})),
      seedDefaults: mock(async () => false),
    } as unknown as ProfileStore;

    brain.setProfileStore(mockProfileStore);

    const result = await brain.handleCommand({
      command: "resume-transmogrify",
      args: {
        fromProfile: "nonexistent",
        reason: "test reason",
        summary: "test summary",
        eventContexts: [],
      },
    });

    expect(result).toBe("continue");
    expect(mockProfileStore.get).toHaveBeenCalledWith("nonexistent");
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  test("handles missing ProfileStore gracefully", async () => {
    const brain = new TestChimpBrain(
      "test-chimp",
      "test-model",
      mockPublish,
      mockLogger,
      "http://localhost:3000",
    );

    // Don't set a ProfileStore
    const result = await brain.handleCommand({
      command: "resume-transmogrify",
      args: {
        fromProfile: "scout",
        reason: "test reason",
        summary: "test summary",
        eventContexts: [],
      },
    });

    expect(result).toBe("continue");
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  test("continues processing even if profile validation fails", async () => {
    const brain = new TestChimpBrain(
      "test-chimp",
      "test-model",
      mockPublish,
      mockLogger,
      "http://localhost:3000",
    );

    // Mock ProfileStore that throws an error
    const mockProfileStore = {
      get: mock(async () => {
        throw new Error("Database error");
      }),
      save: mock(async () => {}),
      delete: mock(async () => false),
      list: mock(async () => ({})),
      seedDefaults: mock(async () => false),
    } as unknown as ProfileStore;

    brain.setProfileStore(mockProfileStore);

    // This should not throw, but continue processing
    let error: Error | null = null;
    try {
      await brain.handleCommand({
        command: "resume-transmogrify",
        args: {
          fromProfile: "scout",
          reason: "test reason",
          summary: "test summary",
          eventContexts: [],
        },
      });
    } catch (e) {
      error = e as Error;
    }

    expect(error).not.toBeNull();
  });

  test("restores event contexts from predecessor", async () => {
    const brain = new TestChimpBrain(
      "test-chimp",
      "test-model",
      mockPublish,
      mockLogger,
      "http://localhost:3000",
    );

    const mockProfileStore = {
      get: mock(async () => null),
      save: mock(async () => {}),
      delete: mock(async () => false),
      list: mock(async () => ({})),
      seedDefaults: mock(async () => false),
    } as unknown as ProfileStore;

    brain.setProfileStore(mockProfileStore);

    const eventContexts = [
      {
        seenAt: "2026-04-20T01:00:00.000Z",
        context: {
          source: "github" as const,
          repo: "owner/repo",
          installationId: 123,
          event: {
            name: "issue_comment.created" as const,
            issueNumber: 42,
            isPR: false,
            commentId: 456,
            author: "user123",
          },
        },
      },
    ];

    const eventContextsReceived: any[] = [];
    brain.onEventContextsChanged = (list) => {
      eventContextsReceived.push(...list);
    };

    const result = await brain.handleCommand({
      command: "resume-transmogrify",
      args: {
        fromProfile: "scout",
        reason: "test reason",
        summary: "test summary",
        eventContexts,
      },
    });

    expect(result).toBe("continue");
    expect(eventContextsReceived).toEqual(eventContexts);
  });
});
