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
      { type: "upsert_status", profile: P, status: "running" },
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
      { type: "upsert_status", profile: P, status: "pending" },
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
      { type: "upsert_status", profile: P, status: "failed" },
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
      type: "upsert_state",
      profile: "fast",
      status: "scheduled",
    });
    expect(decision.actions.find((a) => a.type === "register_topic")).toEqual({
      type: "register_topic",
      topic,
      force: false,
    });
    expect(decision.actions.find((a) => a.type === "create_job")).toEqual({
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
      decision.actions.find((a) => a.type === "upsert_state"),
    ).toBeUndefined();
    expect(
      decision.actions.find((a) => a.type === "create_consumers"),
    ).toBeDefined();
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
  test("transmogrify: upserts state, deletes job, creates new", () => {
    const decision = decide(state(), {
      type: "chimp_output",
      chimpId: "chimp-1",
      message: {
        type: "transmogrify",
        targetProfile: "powerful",
        reason: "need more power",
        summary: "working on X",
      },
    });

    expect(decision.chimpId).toBe("chimp-1");
    expect(decision.actions).toEqual([
      { type: "upsert_state", profile: "powerful", status: "scheduled" },
      { type: "delete_job" },
      { type: "create_job", profile: "powerful" },
    ]);
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
});
