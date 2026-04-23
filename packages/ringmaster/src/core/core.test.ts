import { describe, expect, test } from "bun:test";
import {
  type CoreState,
  decide,
  deriveChimpId,
  deriveTransmogrifyChimpId,
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
      force: true,
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
      force: false,
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

  test("forceClaimTopic: topic claimed by stale chimp, no pod → force claim with reclaim", () => {
    const staleChimpId = "stale-chimp";
    const decision = decide(state(), {
      type: "event_received",
      chimpId: staleChimpId,
      profile: P,
      eventSubject,
      topic,
      topicOwner: { chimpId: staleChimpId },
      messageSequence: 42,
    });

    const registerTopicAction = decision.actions.find(
      (a) => a.type === "register_topic",
    );
    expect(registerTopicAction).toBeDefined();
    expect(registerTopicAction?.force).toBe(true);
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
  test("transmogrify: new chimpId, transfers topics, sends resume command", () => {
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
      profile: "scout",
      message: {
        type: "transmogrify",
        fromProfile: "scout",
        targetProfile: "powerful",
        reason: "need more power",
        summary: "working on X",
        eventContexts,
      },
    });

    const newChimpId = deriveTransmogrifyChimpId("chimp-1", "powerful");

    expect(decision.chimpId).toBe("chimp-1");
    expect(decision.actions).toEqual([
      { chimpId: "chimp-1", type: "delete_job" },
      {
        type: "transfer_topics",
        fromChimpId: "chimp-1",
        toChimpId: newChimpId,
      },
      { chimpId: "chimp-1", type: "delete_state" },
      {
        chimpId: newChimpId,
        type: "upsert_status",
        profile: "powerful",
        status: "scheduled",
      },
      {
        chimpId: newChimpId,
        type: "send_command",
        command: {
          command: "resume-transmogrify",
          args: {
            fromProfile: "scout",
            reason: "need more power",
            summary: "working on X",
            eventContexts,
          },
        },
      },
      { chimpId: newChimpId, type: "create_job", profile: "powerful" },
    ]);
  });

  test("transmogrify: new chimpId is deterministic", () => {
    const id1 = deriveTransmogrifyChimpId("chimp-1", "powerful");
    const id2 = deriveTransmogrifyChimpId("chimp-1", "powerful");
    const id3 = deriveTransmogrifyChimpId("chimp-1", "worker");

    expect(id1).toBe(id2);
    expect(id1).not.toBe(id3);
    expect(id1).toMatch(/^evt-/);
  });

  test("other output types: noop", () => {
    const decision = decide(state(), {
      type: "chimp_output",
      chimpId: "chimp-1",
      profile: "scout",
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
      profile: "scout",
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

  test("chimp_output: dashboard-response type → noop", () => {
    const decision = decide(state(), {
      type: "chimp_output",
      chimpId: "chimp-2",
      message: {
        type: "agent-message-response",
        content: "status update",
        sessionId: "dashboard-session",
      },
    });

    expect(decision.actions).toEqual([{ type: "noop" }]);
  });

  test("transmogrify with stored event contexts → transfers all contexts", () => {
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
      profile: "scout",
      message: {
        type: "transmogrify",
        fromProfile: "scout",
        targetProfile: "powerful",
        reason: "need more power",
        summary: "working on X",
        eventContexts,
      },
    });

    const newChimpId = deriveTransmogrifyChimpId("chimp-1", "powerful");
    const sendCommandAction = decision.actions.find(
      (a) => a.type === "send_command",
    ) as any;

    expect(sendCommandAction).toBeDefined();
    expect(sendCommandAction.command.args.eventContexts).toEqual(eventContexts);
    expect(sendCommandAction.command.args.eventContexts.length).toBe(2);
  });

  test("chimp-handoff: creates new chimp with handoff action", () => {
    const subscriptions = [
      {
        platform: "github" as const,
        owner: "tonyd33",
        repo: "circus",
        type: "pr" as const,
        number: 100,
      },
    ];
    const eventContexts: any[] = [];

    const decision = decide(state(), {
      type: "chimp_output",
      chimpId: "chimp-scout",
      profile: "scout",
      message: {
        type: "chimp-handoff",
        targetProfile: "worker",
        reason: "need to implement feature",
        summary: "analyzed design",
        subscriptions,
        eventContexts,
      },
    });

    expect(decision.chimpId).toBe("chimp-scout");
    expect(decision.actions).toHaveLength(1);
    expect(decision.actions[0]).toEqual({
      type: "handoff",
      fromChimpId: "chimp-scout",
      toChimpId: deriveTransmogrifyChimpId("chimp-scout", "worker"),
      targetProfile: "worker",
      fromProfile: "scout",
      reason: "need to implement feature",
      summary: "analyzed design",
      subscriptions,
      eventContexts,
    });
  });

  test("chimp-handoff: transfers subscriptions to new chimp", () => {
    const subscriptions = [
      {
        platform: "github" as const,
        owner: "owner1",
        repo: "repo1",
        type: "issue" as const,
        number: 42,
      },
      {
        platform: "github" as const,
        owner: "owner2",
        repo: "repo2",
        type: "pr" as const,
        number: 99,
      },
    ];

    const decision = decide(state(), {
      type: "chimp_output",
      chimpId: "old-chimp",
      profile: "scout",
      message: {
        type: "chimp-handoff",
        targetProfile: "powerful",
        reason: "upgrade needed",
        summary: "work in progress",
        subscriptions,
        eventContexts: [],
      },
    });

    const handoffAction = decision.actions[0] as any;
    expect(handoffAction.type).toBe("handoff");
    expect(handoffAction.subscriptions).toEqual(subscriptions);
    expect(handoffAction.subscriptions.length).toBe(2);
  });

  test("chimp-handoff with event contexts → preserves contexts", () => {
    const subscriptions: any[] = [];
    const eventContexts = [
      {
        seenAt: "2026-04-23T06:39:00.000Z",
        context: {
          source: "github" as const,
          repo: "owner/repo",
          installationId: 123,
          event: {
            name: "issues.opened" as const,
            issueNumber: 100,
            author: "tonyd33",
            title: "Test issue",
          },
        },
      },
    ];

    const decision = decide(state(), {
      type: "chimp_output",
      chimpId: "chimp-scout",
      profile: "scout",
      message: {
        type: "chimp-handoff",
        targetProfile: "worker",
        reason: "continuing work",
        summary: "previous context preserved",
        subscriptions,
        eventContexts,
      },
    });

    const handoffAction = decision.actions[0] as any;
    expect(handoffAction.eventContexts).toEqual(eventContexts);
  });
});
