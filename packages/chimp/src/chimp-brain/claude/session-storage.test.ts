import { describe, expect, test } from "bun:test";
import { ClaudeChimpStateSchema } from "./session-storage.ts";

describe("ClaudeChimpStateSchema", () => {
  test("round-trips a state with populated eventContexts", () => {
    const state = {
      sessionId: "abc-123",
      workingDir: "/tmp/work",
      model: "claude-sonnet-4-5",
      allowedTools: ["Read", "Write"],
      eventContexts: [
        {
          seenAt: "2026-04-20T01:00:00.000Z",
          context: {
            source: "discord" as const,
            interactionToken: "tok",
            applicationId: "app",
            channelId: "ch",
          },
        },
        {
          seenAt: "2026-04-20T02:00:00.000Z",
          context: {
            source: "github" as const,
            repo: "tonyd33/circus",
            installationId: 42,
            event: {
              name: "issue_comment.created" as const,
              issueNumber: 54,
              isPR: false,
              commentId: 99,
              author: "tonyd33",
            },
          },
        },
      ],
    };

    const serialized = JSON.stringify(state);
    const parsed = ClaudeChimpStateSchema.safeParse(JSON.parse(serialized));

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data).toEqual(state);
    }
  });

  test("legacy blob missing eventContexts defaults to []", () => {
    const legacy = {
      sessionId: "legacy-session",
      workingDir: "/tmp/legacy",
      model: "claude-sonnet-4-5",
      allowedTools: [],
    };

    const parsed = ClaudeChimpStateSchema.safeParse(legacy);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.eventContexts).toEqual([]);
    }
  });

  test("legacy blob without sessionId parses (undefined)", () => {
    const legacy = {
      workingDir: "/tmp/fresh",
      model: "claude-sonnet-4-5",
      allowedTools: [],
    };

    const parsed = ClaudeChimpStateSchema.safeParse(legacy);

    expect(parsed.success).toBe(true);
    if (parsed.success) {
      expect(parsed.data.sessionId).toBeUndefined();
      expect(parsed.data.eventContexts).toEqual([]);
    }
  });

  test("rejects blob missing required non-defaulted fields", () => {
    const invalid = {
      sessionId: "x",
      model: "claude-sonnet-4-5",
      allowedTools: [],
    };

    const parsed = ClaudeChimpStateSchema.safeParse(invalid);

    expect(parsed.success).toBe(false);
  });

  test("rejects eventContexts entries with unknown source", () => {
    const invalid = {
      sessionId: "x",
      workingDir: "/tmp",
      model: "claude-sonnet-4-5",
      allowedTools: [],
      eventContexts: [
        {
          seenAt: "2026-04-20T00:00:00.000Z",
          context: { source: "myspace", poke: true },
        },
      ],
    };

    const parsed = ClaudeChimpStateSchema.safeParse(invalid);

    expect(parsed.success).toBe(false);
  });

  test("accepts dashboard and unknown event context sources", () => {
    const state = {
      sessionId: "x",
      workingDir: "/tmp",
      model: "claude-sonnet-4-5",
      allowedTools: [],
      eventContexts: [
        {
          seenAt: "2026-04-20T00:00:00.000Z",
          context: { source: "dashboard" as const },
        },
        {
          seenAt: "2026-04-20T00:00:01.000Z",
          context: { source: "unknown" as const },
        },
      ],
    };

    const parsed = ClaudeChimpStateSchema.safeParse(state);

    expect(parsed.success).toBe(true);
  });
});
