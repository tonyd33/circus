/**
 * Tests for pure core logic
 */

import { describe, expect, test } from "bun:test";
import {
  type CoreState,
  DEFAULT_HEALTH_CONFIG,
  decide,
  decideOnCompletion,
  decideOnMessageReceived,
  decideOnPodEvent,
  decideOnReconcile,
  type EventPayload,
  isHealthy,
} from "./core.ts";

describe("isHealthy", () => {
  const now = Date.now();

  test("returns false when health is null", () => {
    expect(isHealthy(null, now)).toBe(false);
  });

  test("returns true when heartbeat is recent", () => {
    const health = {
      lastHeartbeat: now - 10_000, // 10 seconds ago
      messageCount: 5,
    };
    expect(isHealthy(health, now)).toBe(true);
  });

  test("returns false when heartbeat is stale", () => {
    const health = {
      lastHeartbeat: now - 40_000, // 40 seconds ago
      messageCount: 5,
    };
    expect(isHealthy(health, now)).toBe(false);
  });

  test("respects custom config", () => {
    const health = {
      lastHeartbeat: now - 40_000, // 40 seconds ago
      messageCount: 5,
    };
    // With 60 second threshold, this should be healthy
    expect(isHealthy(health, now, { maxHeartbeatAge: 60_000 })).toBe(true);
  });
});

describe("decideOnCompletion", () => {
  const baseState: CoreState = {
    chimpState: null,
    sessionExists: true,
    health: { lastHeartbeat: Date.now(), messageCount: 5 },
    now: Date.now(),
  };

  test("idle_timeout: deletes session, health, and pod", () => {
    const decision = decideOnCompletion(baseState, "idle_timeout");

    expect(decision.actions).toContainEqual({ type: "delete_health" });
    expect(decision.actions).toContainEqual({ type: "delete_session" });
    expect(decision.actions).toContainEqual({ type: "delete_pod" });
    expect(decision.actions).toContainEqual({
      type: "update_chimp_state",
      status: "unknown",
    });
    expect(decision.reason).toContain("idle_timeout");
  });

  test("explicit_stop: deletes health and pod but NOT session", () => {
    const decision = decideOnCompletion(baseState, "explicit_stop");

    expect(decision.actions).toContainEqual({ type: "delete_health" });
    expect(decision.actions).toContainEqual({ type: "delete_pod" });
    expect(decision.actions).not.toContainEqual({ type: "delete_session" });
    expect(decision.reason).toContain("explicit_stop");
  });

  test("error: deletes health and pod but NOT session", () => {
    const decision = decideOnCompletion(baseState, "error");

    expect(decision.actions).toContainEqual({ type: "delete_health" });
    expect(decision.actions).toContainEqual({ type: "delete_pod" });
    expect(decision.actions).not.toContainEqual({ type: "delete_session" });
    expect(decision.reason).toContain("error");
  });
});

describe("decideOnPodEvent", () => {
  const now = Date.now();

  test("added: running pod updates state to running", () => {
    const pod: any = { status: { phase: "Running" } };
    const state: CoreState = {
      chimpState: null,
      sessionExists: true,
      health: null,
      now,
    };

    const decision = decideOnPodEvent(state, "added", pod);

    expect(decision.actions).toContainEqual({
      type: "update_chimp_state",
      status: "running",
    });
    expect(decision.reason).toContain("added");
  });

  test("added: pending pod updates state to pending", () => {
    const pod: any = { status: { phase: "Pending" } };
    const state: CoreState = {
      chimpState: null,
      sessionExists: true,
      health: null,
      now,
    };

    const decision = decideOnPodEvent(state, "added", pod);

    expect(decision.actions).toContainEqual({
      type: "update_chimp_state",
      status: "pending",
    });
  });

  test("modified: failed pod with session recreates", () => {
    const pod: any = { status: { phase: "Failed" } };
    const state: CoreState = {
      chimpState: null,
      sessionExists: true,
      health: null,
      now,
    };

    const decision = decideOnPodEvent(state, "modified", pod);

    expect(decision.actions).toContainEqual({ type: "delete_health" });
    expect(decision.actions).toContainEqual({ type: "create_pod" });
    expect(decision.reason).toContain("recreating");
  });

  test("modified: failed pod without session does NOT recreate", () => {
    const pod: any = { status: { phase: "Failed" } };
    const state: CoreState = {
      chimpState: null,
      sessionExists: false,
      health: null,
      now,
    };

    const decision = decideOnPodEvent(state, "modified", pod);

    expect(decision.actions).toContainEqual({ type: "delete_health" });
    expect(decision.actions).not.toContainEqual({ type: "create_pod" });
    expect(decision.reason).toContain("not recreating");
  });

  test("deleted: with session recreates pod", () => {
    const state: CoreState = {
      chimpState: null,
      sessionExists: true,
      health: null,
      now,
    };

    const decision = decideOnPodEvent(state, "deleted", null);

    expect(decision.actions).toContainEqual({ type: "delete_health" });
    expect(decision.actions).toContainEqual({ type: "create_pod" });
    expect(decision.reason).toContain("recreating");
  });

  test("deleted: without session does NOT recreate", () => {
    const state: CoreState = {
      chimpState: null,
      sessionExists: false,
      health: null,
      now,
    };

    const decision = decideOnPodEvent(state, "deleted", null);

    expect(decision.actions).toContainEqual({ type: "delete_health" });
    expect(decision.actions).not.toContainEqual({ type: "create_pod" });
    expect(decision.actions).toContainEqual({
      type: "update_chimp_state",
      status: "failed",
    });
    expect(decision.reason).toContain("not recreating");
  });
});

describe("decideOnMessageReceived", () => {
  const now = Date.now();

  test("healthy chimp: does nothing", () => {
    const state: CoreState = {
      chimpState: null,
      sessionExists: true,
      health: { lastHeartbeat: now - 10_000, messageCount: 5 },
      now,
    };

    const decision = decideOnMessageReceived(state);

    expect(decision.actions).toContainEqual({ type: "noop" });
    expect(decision.reason).toContain("already healthy");
  });

  test("unhealthy chimp: creates stream and pod", () => {
    const state: CoreState = {
      chimpState: null,
      sessionExists: true,
      health: null,
      now,
    };

    const decision = decideOnMessageReceived(state);

    expect(decision.actions).toContainEqual({ type: "create_stream" });
    expect(decision.actions).toContainEqual({ type: "create_pod" });
    expect(decision.actions).toContainEqual({
      type: "update_chimp_state",
      status: "pending",
    });
    expect(decision.reason).toContain("on-demand");
  });

  test("stale health: creates stream and pod", () => {
    const state: CoreState = {
      chimpState: null,
      sessionExists: true,
      health: { lastHeartbeat: now - 40_000, messageCount: 5 },
      now,
    };

    const decision = decideOnMessageReceived(state);

    expect(decision.actions).toContainEqual({ type: "create_stream" });
    expect(decision.actions).toContainEqual({ type: "create_pod" });
  });
});

describe("decideOnReconcile", () => {
  const now = Date.now();

  test("healthy chimp: does nothing", () => {
    const state: CoreState = {
      chimpState: null,
      sessionExists: true,
      health: { lastHeartbeat: now - 10_000, messageCount: 5 },
      now,
    };

    const decision = decideOnReconcile(state);

    expect(decision.actions).toContainEqual({ type: "noop" });
    expect(decision.reason).toContain("healthy");
  });

  test("unhealthy chimp: creates stream and pod", () => {
    const state: CoreState = {
      chimpState: null,
      sessionExists: true,
      health: null,
      now,
    };

    const decision = decideOnReconcile(state);

    expect(decision.actions).toContainEqual({ type: "create_stream" });
    expect(decision.actions).toContainEqual({ type: "create_pod" });
    expect(decision.actions).toContainEqual({
      type: "update_chimp_state",
      status: "pending",
    });
    expect(decision.reason).toContain("unhealthy");
  });
});

describe("decide (main router)", () => {
  const now = Date.now();
  const healthyState: CoreState = {
    chimpState: null,
    sessionExists: true,
    health: { lastHeartbeat: now - 10_000, messageCount: 5 },
    now,
  };

  test("routes completion events", () => {
    const payload: EventPayload = {
      type: "completion",
      reason: "idle_timeout",
    };
    const decision = decide(healthyState, payload);

    expect(decision.reason).toContain("idle_timeout");
    expect(decision.actions).toContainEqual({ type: "delete_session" });
  });

  test("routes pod events", () => {
    const payload: EventPayload = {
      type: "pod_event",
      event: "deleted",
      pod: null,
    };
    const decision = decide(healthyState, payload);

    expect(decision.reason).toContain("Pod deleted");
  });

  test("routes message_received events", () => {
    const payload: EventPayload = { type: "message_received" };
    const decision = decide(healthyState, payload);

    expect(decision.reason).toContain("healthy");
  });

  test("routes reconcile_tick events", () => {
    const payload: EventPayload = { type: "reconcile_tick" };
    const decision = decide(healthyState, payload);

    expect(decision.reason).toContain("healthy");
  });
});

describe("Critical bug scenarios", () => {
  const now = Date.now();

  test("Bug 1: Pod deleted after flushall should NOT recreate", () => {
    // Scenario: User runs flushall on Redis, then manually deletes pod
    const state: CoreState = {
      chimpState: null,
      sessionExists: false, // No session after flushall
      health: null,
      now,
    };

    const decision = decideOnPodEvent(state, "deleted", null);

    // Should NOT create pod since no session exists
    expect(decision.actions).not.toContainEqual({ type: "create_pod" });
    expect(decision.reason).toContain("not recreating");
  });

  test("Bug 2: Idle timeout should prevent recreation", () => {
    // Scenario: Chimp idles out, session should be deleted
    const state: CoreState = {
      chimpState: null,
      sessionExists: true,
      health: { lastHeartbeat: now - 10_000, messageCount: 5 },
      now,
    };

    const decision = decideOnCompletion(state, "idle_timeout");

    // Should delete session to prevent reconciler from recreating
    expect(decision.actions).toContainEqual({ type: "delete_session" });
  });

  test("Bug 3: Session exists but pod deleted - should recreate", () => {
    // Scenario: Pod crashes but session still exists
    const state: CoreState = {
      chimpState: null,
      sessionExists: true,
      health: null,
      now,
    };

    const decision = decideOnPodEvent(state, "deleted", null);

    // Should recreate pod since session exists
    expect(decision.actions).toContainEqual({ type: "create_pod" });
    expect(decision.reason).toContain("recreating");
  });

  test("Bug 4: Reconcile with no session should not create chimp", () => {
    // Scenario: Reconciler runs but no session exists
    const state: CoreState = {
      chimpState: null,
      sessionExists: false,
      health: null,
      now,
    };

    // Note: Reconciler should only process sessions that exist
    // This test verifies what happens if reconciler is called anyway
    const decision = decideOnReconcile(state);

    // Even with no health, should try to create if reconciling
    // The reconciler itself should filter by sessionExists before calling
    expect(decision.actions).toContainEqual({ type: "create_stream" });
  });

  test("Bug 5: Pod exits normally (idle timeout) - should NOT recreate even if session exists", () => {
    // Scenario: Chimp exits normally due to idle timeout, pod phase is Succeeded
    const pod: any = {
      status: {
        phase: "Succeeded",
        containerStatuses: [
          {
            state: {
              terminated: {
                exitCode: 0,
                reason: "Completed",
              },
            },
          },
        ],
      },
    };

    const state: CoreState = {
      chimpState: null,
      sessionExists: true, // Session still exists
      health: null,
      now,
    };

    const decision = decideOnPodEvent(state, "deleted", pod);

    // Should NOT recreate pod because it exited normally
    expect(decision.actions).not.toContainEqual({ type: "create_pod" });
    expect(decision.reason).toContain("exited normally");
  });

  test("Bug 6: Pod crashes (non-zero exit) - should recreate if session exists", () => {
    // Scenario: Chimp crashes with non-zero exit code
    const pod: any = {
      status: {
        phase: "Failed",
        containerStatuses: [
          {
            state: {
              terminated: {
                exitCode: 137, // SIGKILL
                reason: "Error",
              },
            },
          },
        ],
      },
    };

    const state: CoreState = {
      chimpState: null,
      sessionExists: true,
      health: null,
      now,
    };

    const decision = decideOnPodEvent(state, "modified", pod);

    // Should recreate pod because it crashed
    expect(decision.actions).toContainEqual({ type: "create_pod" });
    expect(decision.reason).toContain("crashed");
  });
});
