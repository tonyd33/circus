import { describe, expect, test } from "bun:test";
import { type CoreState, decide, deriveChimpId } from "./core.ts";

const P = "default";
const T = new Date("2026-04-22T00:00:00.000Z");

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
      topicSubscribers: [{ chimpId: "existing-chimp" }],
      messageSequence: 42,
    });

    expect(decision.chimpId).toBe("existing-chimp");
    expect(decision.actions).toEqual([{ type: "noop" }]);
    expect(decision.reason).toContain("already has subscribers");
  });

  test("topic claimed + no pod → reclaim", () => {
    const decision = decide(state(), {
      type: "event_received",
      chimpId: "stale-chimp",
      profile: P,
      eventSubject,
      topic,
      topicSubscribers: [{ chimpId: "stale-chimp" }],
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
      topicSubscribers: [],
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
      topicSubscribers: [],
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
      topicSubscribers: [],
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
      topicSubscribers: [],
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
      topicSubscribers: [],
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
      topicSubscribers: [],
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

  test("topic with subscriber but no pod → reclaim with register_topic", () => {
    const staleChimpId = "stale-chimp";
    const decision = decide(state(), {
      type: "event_received",
      chimpId: staleChimpId,
      profile: P,
      eventSubject,
      topic,
      topicSubscribers: [{ chimpId: staleChimpId }],
      messageSequence: 42,
    });

    const registerTopicAction = decision.actions.find(
      (a) => a.type === "register_topic",
    );
    expect(registerTopicAction).toBeDefined();
    expect(registerTopicAction).toEqual({
      chimpId: staleChimpId,
      type: "register_topic",
      topic,
    });
  });

  test("debug event (null topic) → no register_topic", () => {
    const chimpId = deriveChimpId(null, "events.debug.abc123");
    const decision = decide(state(), {
      type: "event_received",
      chimpId,
      profile: P,
      eventSubject: "events.debug.abc123",
      topic: null,
      topicSubscribers: [],
      messageSequence: 42,
    });

    expect(
      decision.actions.find((a) => a.type === "register_topic"),
    ).toBeUndefined();
    expect(decision.actions.find((a) => a.type === "create_job")).toBeDefined();
  });
});

describe("chimp_output", () => {
  test("chimp-request: creates job for requested chimp", () => {
    const decision = decide(state(), {
      type: "chimp_output",
      timestamp: T,
      chimpId: "chimp-1",
      profile: "scout",
      message: {
        type: "chimp-request",
        profile: "worker",
        chimpId: "new-chimp",
      },
    });

    expect(decision.chimpId).toBe("new-chimp");
    expect(decision.actions).toEqual([
      {
        chimpId: "new-chimp",
        type: "upsert_status",
        profile: "worker",
        status: "scheduled",
      },
      {
        chimpId: "new-chimp",
        type: "create_consumers",
        eventFilterSubjects: ["events.direct.new-chimp"],
        deliverFrom: { type: "time", value: T },
      },
      {
        chimpId: "new-chimp",
        type: "create_job",
        profile: "worker",
      },
    ]);
  });

  test("chimp-request: reason includes requesting chimp", () => {
    const decision = decide(state(), {
      type: "chimp_output",
      timestamp: T,
      chimpId: "requester",
      profile: "scout",
      message: {
        type: "chimp-request",
        profile: "worker",
        chimpId: "target",
      },
    });

    expect(decision.reason).toContain("requester");
    expect(decision.reason).toContain("target");
  });

  test("other output types: no actions", () => {
    const decision = decide(state(), {
      type: "chimp_output",
      timestamp: T,
      chimpId: "chimp-1",
      profile: "scout",
      message: {
        type: "agent-message-response",
        content: "hello",
        sessionId: "s1",
      },
    });

    expect(decision.actions).toEqual([]);
  });

  test("agent-message-response → no actions", () => {
    const decision = decide(state(), {
      type: "chimp_output",
      timestamp: T,
      chimpId: "chimp-1",
      profile: "scout",
      message: {
        type: "agent-message-response",
        content: "task completed",
        sessionId: "session-123",
      },
    });

    expect(decision.chimpId).toBe("chimp-1");
    expect(decision.actions).toEqual([]);
  });
});
