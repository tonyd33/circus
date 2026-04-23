import { describe, expect, test } from "bun:test";
import {
  type CoreState,
  decide,
  deriveChimpId,
  type EventPayload,
} from "./core.ts";

const P = "default";

function state(overrides: Partial<CoreState> = {}): CoreState {
  return { now: Date.now(), pod: undefined, ...overrides };
}

describe("pod_event", () => {
  test("DELETED: no actions", () => {
    const pod: any = { status: { phase: "Succeeded" } };
    const decision = decide(state(), {
      type: "pod_event",
      chimpId: "chimp-1",
      profile: P,
      eventType: "DELETED",
      pod,
    });

    expect(decision.chimpId).toBe("chimp-1");
    expect(decision.actions).toEqual([]);
  });

  test("ADDED Running: upserts status", () => {
    const pod: any = { status: { phase: "Running" } };
    const decision = decide(state(), {
      type: "pod_event",
      chimpId: "chimp-1",
      profile: P,
      eventType: "ADDED",
      pod,
    });

    expect(decision.actions).toEqual([
      {
        chimpId: "chimp-1",
        type: "upsert_status",
        profile: P,
        status: "running",
      },
    ]);
  });

  test("Pending phase maps to pending", () => {
    const pod: any = { status: { phase: "Pending" } };
    const decision = decide(state(), {
      type: "pod_event",
      chimpId: "chimp-1",
      profile: P,
      eventType: "ADDED",
      pod,
    });

    expect(decision.actions).toEqual([
      {
        chimpId: "chimp-1",
        type: "upsert_status",
        profile: P,
        status: "pending",
      },
    ]);
  });

  test("Failed phase maps to failed", () => {
    const pod: any = { status: { phase: "Failed" } };
    const decision = decide(state(), {
      type: "pod_event",
      chimpId: "chimp-1",
      profile: P,
      eventType: "MODIFIED",
      pod,
    });

    expect(decision.actions).toEqual([
      {
        chimpId: "chimp-1",
        type: "upsert_status",
        profile: P,
        status: "failed",
      },
    ]);
  });
});

describe("event_received", () => {
  const eventSubject = "events.github.tonyd33.circus.pr.42.comment";
  const topic = {
    platform: "github" as const,
    owner: "tonyd33",
    repo: "circus",
    type: "pr" as const,
    number: 42,
  };

  test("topic claimed + pod alive → noop", () => {
    const pod: any = { status: { phase: "Running" } };
    const decision = decide(state({ pod }), {
      type: "event_received",
      chimpId: "existing-chimp",
      profile: P,
      eventSubject,
      topic,
      topicOwner: { chimpId: "existing-chimp" },
      messageSequence: 42,
    });

    expect(decision.chimpId).toBe("existing-chimp");
    expect(decision.actions).toEqual([{ type: "noop" }]);
    expect(decision.reason).toContain("already claimed");
  });

  test("topic claimed + no pod → reclaim", () => {
    const decision = decide(state(), {
      type: "event_received",
      chimpId: "stale-chimp",
      profile: P,
      eventSubject,
      topic,
      topicOwner: { chimpId: "stale-chimp" },
      messageSequence: 42,
    });

    expect(decision.chimpId).toBe("stale-chimp");
    expect(decision.actions.find((a) => a.type === "create_job")).toBeDefined();
    expect(decision.actions.find((a) => a.type === "register_topic")).toEqual({
      chimpId: "stale-chimp",
      type: "register_topic",
      topic,
    });
  });

  test("unclaimed, no pod → schedules chimp", () => {
    const chimpId = deriveChimpId(topic, eventSubject);
    const decision = decide(state(), {
      type: "event_received",
      chimpId,
      profile: "fast",
      eventSubject,
      topic,
      topicOwner: null,
      messageSequence: 42,
    });

    expect(decision.chimpId).toBe(chimpId);
    expect(decision.actions[0]).toEqual({
      chimpId,
      type: "upsert_status",
      profile: "fast",
      status: "scheduled",
    });
    expect(decision.actions.find((a) => a.type === "register_topic")).toEqual({
      chimpId,
      type: "register_topic",
      topic,
    });
    expect(decision.actions.find((a) => a.type === "create_job")).toEqual({
      chimpId,
      type: "create_job",
      profile: "fast",
    });
  });

  test("unclaimed, pod exists → no scheduled state", () => {
    const pod: any = { status: { phase: "Running" } };
    const chimpId = deriveChimpId(topic, eventSubject);
    const decision = decide(state({ pod }), {
      type: "event_received",
      chimpId,
      profile: P,
      eventSubject,
      topic,
      topicOwner: null,
      messageSequence: 42,
    });

    expect(
      decision.actions.find((a) => a.type === "upsert_status"),
    ).toBeUndefined();
    expect(
      decision.actions.find((a) => a.type === "create_consumers"),
    ).toBeDefined();
  });

  test("unclaimed, pod exists → create_job + create_consumers", () => {
    const pod: any = { status: { phase: "Running" } };
    const chimpId = deriveChimpId(topic, eventSubject);
    const decision = decide(state({ pod }), {
      type: "event_received",
      chimpId,
      profile: P,
      eventSubject,
      topic,
      topicOwner: null,
      messageSequence: 42,
    });

    expect(decision.actions.find((a) => a.type === "create_job")).toBeDefined();
    expect(
      decision.actions.find((a) => a.type === "create_consumers"),
    ).toBeDefined();
    expect(
      decision.actions.find((a) => a.type === "register_topic"),
    ).toBeDefined();
  });

  test("pod in Pending phase during event_received → creates consumers", () => {
    const pod: any = { status: { phase: "Pending" } };
    const chimpId = deriveChimpId(topic, eventSubject);
    const decision = decide(state({ pod }), {
      type: "event_received",
      chimpId,
      profile: P,
      eventSubject,
      topic,
      topicOwner: null,
      messageSequence: 42,
    });

    expect(
      decision.actions.find((a) => a.type === "upsert_status"),
    ).toBeUndefined();
    expect(
      decision.actions.find((a) => a.type === "create_consumers"),
    ).toBeDefined();
    expect(decision.actions.find((a) => a.type === "create_job")).toBeDefined();
  });

  test("pod in Failed phase during event_received → creates consumers", () => {
    const pod: any = { status: { phase: "Failed" } };
    const chimpId = deriveChimpId(topic, eventSubject);
    const decision = decide(state({ pod }), {
      type: "event_received",
      chimpId,
      profile: P,
      eventSubject,
      topic,
      topicOwner: null,
      messageSequence: 42,
    });

    expect(
      decision.actions.find((a) => a.type === "upsert_status"),
    ).toBeUndefined();
    expect(
      decision.actions.find((a) => a.type === "create_consumers"),
    ).toBeDefined();
    expect(decision.actions.find((a) => a.type === "create_job")).toBeDefined();
  });

  test("pod in Succeeded phase during event_received → creates consumers", () => {
    const pod: any = { status: { phase: "Succeeded" } };
    const chimpId = deriveChimpId(topic, eventSubject);
    const decision = decide(state({ pod }), {
      type: "event_received",
      chimpId,
      profile: P,
      eventSubject,
      topic,
      topicOwner: null,
      messageSequence: 42,
    });

    expect(
      decision.actions.find((a) => a.type === "upsert_status"),
    ).toBeUndefined();
    expect(
      decision.actions.find((a) => a.type === "create_consumers"),
    ).toBeDefined();
    expect(decision.actions.find((a) => a.type === "create_job")).toBeDefined();
  });

  test("debug event (null topic) → no register_topic", () => {
    const chimpId = deriveChimpId(null, "events.debug.abc123");
    const decision = decide(state(), {
      type: "event_received",
      chimpId,
      profile: P,
      eventSubject: "events.debug.abc123",
      topic: null,
      topicOwner: null,
      messageSequence: 10,
    });

    expect(
      decision.actions.find((a) => a.type === "register_topic"),
    ).toBeUndefined();
    expect(decision.actions.find((a) => a.type === "create_job")).toBeDefined();
  });
});

describe("chimp_output", () => {
  test("chimp-request: creates new chimp with transfer command", () => {
    const eventContexts = [
      {
        seenAt: "2026-04-20T01:00:00.000Z",
        context: {
          source: "discord" as const,
          interactionToken: "tok",
          applicationId: "app",
          channelId: "ch",
        },
      },
    ];
    const decision = decide(state(), {
      type: "chimp_output",
      chimpId: "chimp-1",
      message: {
        type: "chimp-request",
        profile: "worker",
        chimpId: "new-chimp-1",
        message: "Continue working on the task",
        eventContexts,
      },
    });

    expect(decision.chimpId).toBe("chimp-1");
    expect(decision.actions).toEqual([
      {
        chimpId: "new-chimp-1",
        type: "upsert_status",
        profile: "worker",
        status: "scheduled",
      },
      {
        chimpId: "new-chimp-1",
        type: "create_consumers",
        eventFilterSubjects: [],
        startSequence: 1,
      },
      {
        chimpId: "new-chimp-1",
        type: "send_command",
        command: {
          command: "resume-transfer",
          args: {
            fromChimpId: "chimp-1",
            message: "Continue working on the task",
            eventContexts,
          },
        },
      },
      {
        chimpId: "new-chimp-1",
        type: "create_job",
        profile: "worker",
      },
    ]);
    expect(decision.reason).toContain("Chimp request from chimp-1");
  });

  test("chimp-request: preserves event contexts", () => {
    const eventContexts = [
      {
        seenAt: "2026-04-20T01:00:00.000Z",
        context: {
          source: "discord" as const,
          interactionToken: "tok-1",
          applicationId: "app-1",
          channelId: "ch-1",
        },
      },
      {
        seenAt: "2026-04-20T02:00:00.000Z",
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
    const decision = decide(state(), {
      type: "chimp_output",
      chimpId: "chimp-1",
      message: {
        type: "chimp-request",
        profile: "architect",
        chimpId: "arch-chimp-1",
        message: "Design the system",
        eventContexts,
      },
    });

    const sendCommandAction = decision.actions.find(
      (a) => a.type === "send_command",
    );
    expect(sendCommandAction).toBeDefined();
    if (sendCommandAction && sendCommandAction.type === "send_command") {
      const cmd = sendCommandAction.command;
      if (cmd.command === "resume-transfer") {
        expect(cmd.args.eventContexts).toEqual(eventContexts);
        expect(cmd.args.eventContexts.length).toBe(2);
      } else {
        throw new Error("Expected resume-transfer command");
      }
    }
  });

  test("chimp-request: empty event contexts", () => {
    const decision = decide(state(), {
      type: "chimp_output",
      chimpId: "chimp-1",
      message: {
        type: "chimp-request",
        profile: "worker",
        chimpId: "helper-1",
        message: "Do this small task",
        eventContexts: [],
      },
    });

    const sendCommandAction = decision.actions.find(
      (a) => a.type === "send_command",
    );
    expect(sendCommandAction).toBeDefined();
    if (sendCommandAction && sendCommandAction.type === "send_command") {
      const cmd = sendCommandAction.command;
      if (cmd.command === "resume-transfer") {
        expect(cmd.args.eventContexts).toEqual([]);
      }
    }
  });

  test("other output types: noop", () => {
    const decision = decide(state(), {
      type: "chimp_output",
      chimpId: "chimp-1",
      message: {
        type: "agent-message-response",
        content: "hello",
        sessionId: "s1",
      },
    });

    expect(decision.actions).toEqual([{ type: "noop" }]);
  });

  test("chimp_output: agent-message-response type → noop", () => {
    const decision = decide(state(), {
      type: "chimp_output",
      chimpId: "chimp-1",
      message: {
        type: "agent-message-response",
        content: "task completed",
        sessionId: "session-123",
      },
    });

    expect(decision.chimpId).toBe("chimp-1");
    expect(decision.actions).toEqual([{ type: "noop" }]);
    expect(decision.reason).toBe("Output: agent-message-response");
  });
});
