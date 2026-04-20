import { describe, expect, test } from "bun:test";
import {
  type CoreState,
  decide,
  decideOnEventReceived,
  decideOnPodEvent,
  type EventPayload,
} from "./core.ts";

const P = "default";

function state(overrides: Partial<CoreState> = {}): CoreState {
  return { now: Date.now(), pod: undefined, topicOwner: null, ...overrides };
}

describe("decideOnPodEvent", () => {
  test("DELETED event: deletes consumers, cleans topics, updates state", () => {
    const pod: any = { status: { phase: "Succeeded" } };
    const decision = decideOnPodEvent(state(), "chimp-1", P, "DELETED", pod);

    expect(decision.chimpId).toBe("chimp-1");
    expect(decision.actions).toEqual([
      { type: "delete_consumers" },
      { type: "cleanup_topics" },
      { type: "upsert_state", profile: P, status: "stopped" },
    ]);
  });

  test("ADDED event: upserts state", () => {
    const pod: any = { status: { phase: "Running" } };
    const decision = decideOnPodEvent(state(), "chimp-1", P, "ADDED", pod);

    expect(decision.actions).toEqual([
      { type: "upsert_state", profile: P, status: "running" },
    ]);
  });

  test("Pending phase maps to pending status", () => {
    const pod: any = { status: { phase: "Pending" } };
    const decision = decideOnPodEvent(state(), "chimp-1", P, "ADDED", pod);

    expect(decision.actions).toEqual([
      { type: "upsert_state", profile: P, status: "pending" },
    ]);
  });

  test("Failed phase maps to failed status", () => {
    const pod: any = { status: { phase: "Failed" } };
    const decision = decideOnPodEvent(state(), "chimp-1", P, "MODIFIED", pod);

    expect(decision.actions).toEqual([
      { type: "upsert_state", profile: P, status: "failed" },
    ]);
  });
});

describe("decideOnEventReceived", () => {
  const eventSubject = "events.github.tonyd33.circus.pr.42.comment";
  const topic = {
    platform: "github" as const,
    owner: "tonyd33",
    repo: "circus",
    type: "pr" as const,
    number: 42,
  };

  test("topic already claimed → noop", () => {
    const s = state({
      topicOwner: {
        chimpId: "existing-chimp",
        profile: P,
        subscribedAt: new Date().toISOString(),
      },
    });
    const decision = decideOnEventReceived(s, P, eventSubject, topic, 42);

    expect(decision.chimpId).toBe("existing-chimp");
    expect(decision.actions).toEqual([{ type: "noop" }]);
    expect(decision.reason).toContain("already claimed");
  });

  test("unclaimed, no pod → schedules chimp with topic registration", () => {
    const decision = decideOnEventReceived(
      state(),
      "fast",
      eventSubject,
      topic,
      42,
    );

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
    });
    expect(decision.actions.find((a) => a.type === "create_job")).toEqual({
      type: "create_job",
      profile: "fast",
    });
  });

  test("unclaimed, pod exists → no scheduled state", () => {
    const pod: any = { status: { phase: "Running" } };
    const s = state({ pod });
    const decision = decideOnEventReceived(s, P, eventSubject, topic, 42);

    expect(
      decision.actions.find((a) => a.type === "upsert_state"),
    ).toBeUndefined();
    expect(
      decision.actions.find((a) => a.type === "create_consumers"),
    ).toBeDefined();
  });

  test("debug event (null topic) → no register_topic action", () => {
    const decision = decideOnEventReceived(
      state(),
      P,
      "events.debug.abc123",
      null,
      10,
    );

    expect(decision.chimpId).toMatch(/^evt-/);
    expect(
      decision.actions.find((a) => a.type === "register_topic"),
    ).toBeUndefined();
    expect(decision.actions.find((a) => a.type === "create_job")).toBeDefined();
  });
});

describe("decide (main router)", () => {
  test("routes pod_event", () => {
    const pod: any = { status: { phase: "Running" } };
    const payload: EventPayload = {
      type: "pod_event",
      profile: P,
      eventType: "DELETED",
      pod,
    };

    const decision = decide(state(), "chimp-1", payload);

    expect(decision.actions).toEqual([
      { type: "delete_consumers" },
      { type: "cleanup_topics" },
      { type: "upsert_state", profile: P, status: "stopped" },
    ]);
  });

  test("routes event_received", () => {
    const payload: EventPayload = {
      type: "event_received",
      profile: P,
      eventSubject: "events.github.tonyd33.circus.pr.42.comment",
      topic: {
        platform: "github",
        owner: "tonyd33",
        repo: "circus",
        type: "pr",
        number: 42,
      },
      messageSequence: 50,
    };

    const decision = decide(state(), "", payload);

    expect(decision.chimpId).toMatch(/^evt-/);
    expect(decision.actions.find((a) => a.type === "create_job")).toEqual({
      type: "create_job",
      profile: P,
    });
  });
});
