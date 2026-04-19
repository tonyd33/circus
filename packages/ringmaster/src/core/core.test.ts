/**
 * Tests for pure core logic
 */

import { describe, expect, test } from "bun:test";
import {
  type CoreState,
  decide,
  decideOnMessageReceived,
  decideOnPodEvent,
  type EventPayload,
} from "./core.ts";

const P = "default";

describe("decideOnPodEvent", () => {
  const baseState: CoreState = { now: Date.now(), pod: undefined };

  test("DELETED event: deletes consumer", () => {
    const pod: any = { status: { phase: "Succeeded" } };
    const decision = decideOnPodEvent(baseState, P, "DELETED", pod);

    expect(decision.actions).toEqual([
      { type: "delete_consumer" },
      { type: "upsert_state", profile: P, status: "stopped" },
    ]);
    expect(decision.reason).toContain("Pod deleted");
  });

  test("ADDED event: upserts state", () => {
    const pod: any = { status: { phase: "Running" } };
    const decision = decideOnPodEvent(baseState, P, "ADDED", pod);

    expect(decision.actions).toEqual([
      { type: "upsert_state", profile: P, status: "running" },
    ]);
  });

  test("MODIFIED event: upserts state", () => {
    const pod: any = { status: { phase: "Running" } };
    const decision = decideOnPodEvent(baseState, P, "MODIFIED", pod);

    expect(decision.actions).toEqual([
      { type: "upsert_state", profile: P, status: "running" },
    ]);
  });

  test("Pending phase maps to pending status", () => {
    const pod: any = { status: { phase: "Pending" } };
    const decision = decideOnPodEvent(baseState, P, "ADDED", pod);

    expect(decision.actions).toEqual([
      { type: "upsert_state", profile: P, status: "pending" },
    ]);
  });

  test("Failed phase maps to failed status", () => {
    const pod: any = { status: { phase: "Failed" } };
    const decision = decideOnPodEvent(baseState, P, "MODIFIED", pod);

    expect(decision.actions).toEqual([
      { type: "upsert_state", profile: P, status: "failed" },
    ]);
  });
});

describe("decideOnMessageReceived", () => {
  test("no pod: sets scheduled, creates consumer and job", () => {
    const state: CoreState = { now: Date.now(), pod: undefined };
    const decision = decideOnMessageReceived(state, "fast", 42);

    expect(decision.actions).toEqual([
      { type: "upsert_state", profile: "fast", status: "scheduled" },
      { type: "create_consumer", profile: "fast", startSequence: 42 },
      { type: "create_job", profile: "fast" },
    ]);
    expect(decision.reason).toContain("scheduling");
  });

  test("pod exists: creates consumer and job, no state upsert", () => {
    const pod: any = { status: { phase: "Running" } };
    const state: CoreState = { now: Date.now(), pod };
    const decision = decideOnMessageReceived(state, P, 42);

    expect(decision.actions).toEqual([
      { type: "create_consumer", profile: P, startSequence: 42 },
      { type: "create_job", profile: P },
    ]);
    expect(decision.reason).toContain("pod exists");
  });

  test("profile flows through to all actions", () => {
    const state: CoreState = { now: Date.now(), pod: undefined };
    const decision = decideOnMessageReceived(state, "powerful", 10);

    const createJob = decision.actions.find((a) => a.type === "create_job");
    expect(createJob).toEqual({ type: "create_job", profile: "powerful" });
    const createConsumer = decision.actions.find(
      (a) => a.type === "create_consumer",
    );
    expect(createConsumer).toEqual({
      type: "create_consumer",
      profile: "powerful",
      startSequence: 10,
    });
  });
});

describe("decide (main router)", () => {
  test("routes pod_event to decideOnPodEvent", () => {
    const pod: any = { status: { phase: "Running" } };
    const state: CoreState = { now: Date.now(), pod: undefined };
    const payload: EventPayload = {
      type: "pod_event",
      profile: P,
      eventType: "DELETED",
      pod,
    };

    const decision = decide(state, payload);

    expect(decision.actions).toEqual([
      { type: "delete_consumer" },
      { type: "upsert_state", profile: P, status: "stopped" },
    ]);
  });

  test("routes message_received with profile", () => {
    const state: CoreState = { now: Date.now(), pod: undefined };
    const payload: EventPayload = {
      type: "message_received",
      profile: P,
      messageSequence: 50,
    };

    const decision = decide(state, payload);

    expect(decision.actions).toEqual([
      { type: "upsert_state", profile: P, status: "scheduled" },
      { type: "create_consumer", profile: P, startSequence: 50 },
      { type: "create_job", profile: P },
    ]);
  });
});
