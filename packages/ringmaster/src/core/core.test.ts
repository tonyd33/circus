import { describe, expect, test } from "bun:test";
import { type CoreState, decide, type EventPayload } from "./core.ts";

const P = "default";

function state(overrides: Partial<CoreState> = {}): CoreState {
  return { now: Date.now(), pod: undefined, topicOwner: null, ...overrides };
}

describe("pod_event", () => {
  test("DELETED: no actions", () => {
    const pod: any = { status: { phase: "Succeeded" } };
    const decision = decide(state(), {
      type: "pod_event",
      chimpId: "chimp-1",
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
      eventType: "ADDED",
      pod,
    });

    expect(decision.actions).toEqual([
      { type: "upsert_status", status: "running" },
    ]);
  });

  test("Pending phase maps to pending status", () => {
    const pod: any = { status: { phase: "Pending" } };
    const decision = decide(state(), {
      type: "pod_event",
      chimpId: "chimp-1",
      eventType: "ADDED",
      pod,
    });

    expect(decision.actions).toEqual([
      { type: "upsert_status", status: "pending" },
    ]);
  });

  test("Failed phase maps to failed status", () => {
    const pod: any = { status: { phase: "Failed" } };
    const decision = decide(state(), {
      type: "pod_event",
      chimpId: "chimp-1",
      eventType: "MODIFIED",
      pod,
    });

    expect(decision.actions).toEqual([
      { type: "upsert_status", status: "failed" },
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
    const s = state({
      pod,
      topicOwner: {
        chimpId: "existing-chimp",
        subscribedAt: new Date().toISOString(),
      },
    });
    const decision = decide(s, {
      type: "event_received",
      profile: P,
      eventSubject,
      topic,
      messageSequence: 42,
    });

    expect(decision.chimpId).toBe("existing-chimp");
    expect(decision.actions).toEqual([{ type: "noop" }]);
    expect(decision.reason).toContain("already claimed");
  });

  test("topic claimed + no pod → reclaim with same chimpId", () => {
    const s = state({
      topicOwner: {
        chimpId: "stale-chimp",
        subscribedAt: new Date().toISOString(),
      },
    });
    const decision = decide(s, {
      type: "event_received",
      profile: P,
      eventSubject,
      topic,
      messageSequence: 42,
    });

    expect(decision.chimpId).toBe("stale-chimp");
    expect(decision.actions.find((a) => a.type === "create_job")).toBeDefined();
    expect(decision.actions.find((a) => a.type === "register_topic")).toEqual({
      type: "register_topic",
      topic,
      profile: P,
      force: true,
    });
    expect(decision.reason).toContain("no pod");
  });

  test("unclaimed, no pod → schedules chimp with topic registration", () => {
    const decision = decide(state(), {
      type: "event_received",
      profile: "fast",
      eventSubject,
      topic,
      messageSequence: 42,
    });

    expect(decision.chimpId).toMatch(/^evt-/);
    expect(decision.actions[0]).toEqual({
      type: "upsert_state",
      profile: "fast",
      status: "scheduled",
    });
    expect(decision.actions.find((a) => a.type === "register_topic")).toEqual({
      type: "register_topic",
      topic,
      profile: "fast",
      force: false,
    });
    expect(decision.actions.find((a) => a.type === "create_job")).toEqual({
      type: "create_job",
      profile: "fast",
    });
  });

  test("unclaimed, pod exists → no scheduled state", () => {
    const pod: any = { status: { phase: "Running" } };
    const s = state({ pod });
    const decision = decide(s, {
      type: "event_received",
      profile: P,
      eventSubject,
      topic,
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
    const decision = decide(state(), {
      type: "event_received",
      profile: P,
      eventSubject: "events.debug.abc123",
      topic: null,
      messageSequence: 10,
    });

    expect(decision.chimpId).toMatch(/^evt-/);
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
    expect(decision.reason).toContain("Transmogrify");
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
