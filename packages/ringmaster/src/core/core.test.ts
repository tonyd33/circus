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

describe("decideOnPodEvent", () => {
  const now = Date.now();
  const baseState: CoreState = { now };

  test("DELETED event: deletes consumer", () => {
    const pod: any = { status: { phase: "Succeeded" } };
    const decision = decideOnPodEvent(baseState, "DELETED", pod);

    expect(decision.actions).toEqual([
      { type: "delete_consumer" },
      { type: "upsert_state", status: "stopped" },
    ]);
    expect(decision.reason).toContain("Pod deleted");
  });

  test("ADDED event: upserts state", () => {
    const pod: any = { status: { phase: "Running" } };
    const decision = decideOnPodEvent(baseState, "ADDED", pod);

    expect(decision.actions).toEqual([
      { type: "upsert_state", status: "running" },
    ]);
    expect(decision.reason).toContain("ADDED");
    expect(decision.reason).toContain("running");
  });

  test("MODIFIED event: upserts state", () => {
    const pod: any = { status: { phase: "Running" } };
    const decision = decideOnPodEvent(baseState, "MODIFIED", pod);

    expect(decision.actions).toEqual([
      { type: "upsert_state", status: "running" },
    ]);
    expect(decision.reason).toContain("MODIFIED");
    expect(decision.reason).toContain("running");
  });

  test("Unknown event type: upserts state", () => {
    const pod: any = { status: { phase: "Running" } };
    const decision = decideOnPodEvent(baseState, "UNKNOWN", pod);

    expect(decision.actions).toEqual([
      { type: "upsert_state", status: "running" },
    ]);
    expect(decision.reason).toContain("UNKNOWN");
    expect(decision.reason).toContain("running");
  });
});

describe("decideOnMessageReceived", () => {
  const now = Date.now();
  const baseState: CoreState = { now };

  test("creates consumer and job with start sequence", () => {
    const messageSequence = 42;
    const decision = decideOnMessageReceived(baseState, messageSequence);

    expect(decision.actions).toEqual([
      { type: "create_consumer", startSequence: 42 },
      { type: "create_job" },
    ]);
    expect(decision.reason).toContain("Message received");
    expect(decision.reason).toContain("ensuring consumer and job exist");
  });

  test("handles different message sequences", () => {
    const messageSequence = 100;
    const decision = decideOnMessageReceived(baseState, messageSequence);

    expect(decision.actions[0]).toEqual({
      type: "create_consumer",
      startSequence: 100,
    });
  });

  test("always creates both consumer and job", () => {
    const decision = decideOnMessageReceived(baseState, 1);

    expect(decision.actions).toHaveLength(2);
    const [first, second] = decision.actions;
    expect(first?.type).toBe("create_consumer");
    expect(second?.type).toBe("create_job");
  });
});

describe("decide (main router)", () => {
  const now = Date.now();
  const state: CoreState = { now };

  test("routes pod_event to decideOnPodEvent", () => {
    const pod: any = { status: { phase: "Running" } };
    const payload: EventPayload = {
      type: "pod_event",
      eventType: "DELETED",
      pod,
    };

    const decision = decide(state, payload);

    expect(decision.actions).toEqual([
      { type: "delete_consumer" },
      { type: "upsert_state", status: "stopped" },
    ]);
    expect(decision.reason).toContain("Pod deleted");
  });

  test("routes message_received to decideOnMessageReceived", () => {
    const payload: EventPayload = {
      type: "message_received",
      messageSequence: 50,
    };

    const decision = decide(state, payload);

    expect(decision.actions).toEqual([
      { type: "create_consumer", startSequence: 50 },
      { type: "create_job" },
    ]);
    expect(decision.reason).toContain("Message received");
  });

  test("passes through message sequence correctly", () => {
    const payload: EventPayload = {
      type: "message_received",
      messageSequence: 999,
    };

    const decision = decide(state, payload);

    expect(decision.actions[0]).toEqual({
      type: "create_consumer",
      startSequence: 999,
    });
  });

  test("passes through pod event type correctly", () => {
    const pod: any = { status: { phase: "Pending" } };
    const payload: EventPayload = {
      type: "pod_event",
      eventType: "ADDED",
      pod,
    };

    const decision = decide(state, payload);

    expect(decision.actions).toEqual([
      { type: "upsert_state", status: "pending" },
    ]);
    expect(decision.reason).toContain("ADDED");
  });
});

describe("Simplified event-driven architecture", () => {
  const now = Date.now();
  const state: CoreState = { now };

  test("Message received always triggers creation (idempotent)", () => {
    const payload: EventPayload = {
      type: "message_received",
      messageSequence: 10,
    };

    const decision = decide(state, payload);

    // No health checks, session checks, etc - just create
    expect(decision.actions).toEqual([
      { type: "create_consumer", startSequence: 10 },
      { type: "create_job" },
    ]);
  });

  test("Pod deletion always triggers consumer deletion", () => {
    const pod: any = { status: { phase: "Succeeded" } };
    const payload: EventPayload = {
      type: "pod_event",
      eventType: "DELETED",
      pod,
    };

    const decision = decide(state, payload);

    // No session checks, no recreation logic - just delete consumer
    expect(decision.actions).toEqual([
      { type: "delete_consumer" },
      { type: "upsert_state", status: "stopped" },
    ]);
  });

  test("Non-deletion pod events are ignored", () => {
    const pod: any = { status: { phase: "Running" } };

    // Test all non-deletion events
    for (const eventType of ["ADDED", "MODIFIED"]) {
      const payload: EventPayload = {
        type: "pod_event",
        eventType,
        pod,
      };

      const decision = decide(state, payload);

      expect(decision.actions).toEqual([
        { type: "upsert_state", status: "running" },
      ]);
    }
  });

  test("State is minimal - only timestamp", () => {
    const minimalState: CoreState = { now: Date.now() };

    // Should work with just a timestamp
    const decision1 = decide(minimalState, {
      type: "message_received",
      messageSequence: 1,
    });
    expect(decision1.actions).toHaveLength(2);

    const pod: any = {};
    const decision2 = decide(minimalState, {
      type: "pod_event",
      eventType: "DELETED",
      pod,
    });
    expect(decision2.actions).toHaveLength(2);
  });
});
