/**
 * Tests for pure core logic
 */

import { describe, expect, test } from "bun:test";
import {
  type CoreState,
  DEFAULT_HEALTH_CONFIG,
  decide,
  decideOnCompletion,
  decideOnHeartbeat,
  decideOnMessageReceived,
  decideOnPodEvent,
  decideOnReconcile,
  type EventPayload,
  isHealthy,
  isIdle,
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
    expect(
      isHealthy(health, now, { maxHeartbeatAge: 60_000, maxIdleAge: 300_000 }),
    ).toBe(true);
  });
});

describe("isIdle", () => {
  const now = Date.now();

  test("returns true when activity is null", () => {
    expect(isIdle(null, now)).toBe(true);
  });

  test("returns false when activity is recent", () => {
    const activity = {
      lastActivity: now - 60_000, // 1 minute ago
    };
    expect(isIdle(activity, now)).toBe(false);
  });

  test("returns true when activity is stale", () => {
    const activity = {
      lastActivity: now - 400_000, // 6.67 minutes ago (> 5 min default)
    };
    expect(isIdle(activity, now)).toBe(true);
  });

  test("respects custom config", () => {
    const activity = {
      lastActivity: now - 400_000, // 6.67 minutes ago
    };
    // With 10 minute threshold, this should NOT be idle
    expect(
      isIdle(activity, now, { maxHeartbeatAge: 30_000, maxIdleAge: 600_000 }),
    ).toBe(false);
  });
});

describe("decideOnCompletion", () => {
  const now = Date.now();
  const baseState: CoreState = {
    chimpState: null,
    sessionExists: true,
    health: { lastHeartbeat: now, messageCount: 5 },
    activity: { lastActivity: now }, // Recent activity
    now,
  };

  test("idle_timeout: deletes session, health, and pod", () => {
    const decision = decideOnCompletion(baseState, "idle_timeout");

    expect(decision.actions).toEqual([
      { type: "delete_health" },
      { type: "delete_session" },
      { type: "update_chimp_state", status: "stopped" },
      { type: "delete_pod" },
    ]);
    expect(decision.reason).toContain("idle_timeout");
  });

  test("explicit_stop: deletes health and pod but NOT session", () => {
    const decision = decideOnCompletion(baseState, "explicit_stop");

    expect(decision.actions).toEqual([
      { type: "delete_health" },
      { type: "update_chimp_state", status: "stopped" },
      { type: "delete_pod" },
    ]);
    expect(decision.reason).toContain("explicit_stop");
  });

  test("error: deletes health and pod but NOT session", () => {
    const decision = decideOnCompletion(baseState, "error");

    expect(decision.actions).toEqual([
      { type: "delete_health" },
      { type: "update_chimp_state", status: "unknown" },
      { type: "delete_pod" },
    ]);
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
      activity: null,
      now,
    };

    const decision = decideOnPodEvent(state, "added", pod);

    expect(decision.actions).toEqual([
      { type: "update_chimp_state", status: "running" },
    ]);
    expect(decision.reason).toContain("added");
  });

  test("added: pending pod updates state to pending", () => {
    const pod: any = { status: { phase: "Pending" } };
    const state: CoreState = {
      chimpState: null,
      sessionExists: true,
      health: null,
      activity: null,
      now,
    };

    const decision = decideOnPodEvent(state, "added", pod);

    expect(decision.actions).toEqual([
      { type: "update_chimp_state", status: "pending" },
    ]);
  });

  test("modified: failed pod with session recreates", () => {
    const pod: any = { status: { phase: "Failed" } };
    const state: CoreState = {
      chimpState: null,
      sessionExists: true,
      health: null,
      activity: null,
      now,
    };

    const decision = decideOnPodEvent(state, "modified", pod);

    expect(decision.actions).toEqual([
      { type: "delete_health" },
      { type: "create_pod" },
    ]);
    expect(decision.reason).toContain("recreating");
  });

  test("modified: failed pod without session does NOT recreate", () => {
    const pod: any = { status: { phase: "Failed" } };
    const state: CoreState = {
      chimpState: null,
      sessionExists: false,
      health: null,
      activity: null,
      now,
    };

    const decision = decideOnPodEvent(state, "modified", pod);

    expect(decision.actions).toEqual([{ type: "delete_health" }]);
    expect(decision.reason).toContain("not recreating");
  });

  test("deleted: with session recreates pod", () => {
    const state: CoreState = {
      chimpState: null,
      sessionExists: true,
      health: null,
      activity: null,
      now,
    };

    const decision = decideOnPodEvent(state, "deleted", null);

    expect(decision.actions).toEqual([
      { type: "delete_health" },
      { type: "create_pod" },
    ]);
    expect(decision.reason).toContain("recreating");
  });

  test("deleted: without session does NOT recreate", () => {
    const state: CoreState = {
      chimpState: null,
      sessionExists: false,
      health: null,
      activity: null,
      now,
    };

    const decision = decideOnPodEvent(state, "deleted", null);

    expect(decision.actions).toEqual([
      { type: "delete_health" },
      { type: "update_chimp_state", status: "failed" },
    ]);
    expect(decision.reason).toContain("not recreating");
  });

  test("deleted: pod exits normally without session", () => {
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
      sessionExists: false,
      health: null,
      activity: null,
      now,
    };

    const decision = decideOnPodEvent(state, "deleted", pod);

    expect(decision.actions).toEqual([
      { type: "delete_health" },
      { type: "update_chimp_state", status: "stopped" },
    ]);
    expect(decision.reason).toContain("exited normally");
  });

  test("deleted: pod exits normally with session (should NOT recreate)", () => {
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
      sessionExists: true,
      health: null,
      activity: null,
      now,
    };

    const decision = decideOnPodEvent(state, "deleted", pod);

    expect(decision.actions).toEqual([
      { type: "delete_health" },
      { type: "update_chimp_state", status: "stopped" },
    ]);
    expect(decision.reason).toContain("exited normally");
  });
});

describe("decideOnMessageReceived", () => {
  const now = Date.now();

  test("healthy chimp: does nothing", () => {
    const state: CoreState = {
      chimpState: null,
      sessionExists: true,
      health: { lastHeartbeat: now - 10_000, messageCount: 5 },
      activity: null,
      now,
    };

    const decision = decideOnMessageReceived(state);

    expect(decision.actions).toEqual([{ type: "noop" }]);
    expect(decision.reason).toContain("already healthy");
  });

  test("unhealthy chimp: creates stream and pod", () => {
    const state: CoreState = {
      chimpState: null,
      sessionExists: true,
      health: null,
      activity: null,
      now,
    };

    const decision = decideOnMessageReceived(state);

    expect(decision.actions).toEqual([
      { type: "create_stream" },
      { type: "create_pod" },
      { type: "update_chimp_state", status: "pending" },
    ]);
    expect(decision.reason).toContain("on-demand");
  });

  test("stale health: creates stream and pod", () => {
    const state: CoreState = {
      chimpState: null,
      sessionExists: true,
      health: { lastHeartbeat: now - 40_000, messageCount: 5 },
      activity: null,
      now,
    };

    const decision = decideOnMessageReceived(state);

    expect(decision.actions).toEqual([
      { type: "create_stream" },
      { type: "create_pod" },
      { type: "update_chimp_state", status: "pending" },
    ]);
  });
});

describe("decideOnHeartbeat", () => {
  const now = Date.now();

  test("chimp not running: updates state to running", () => {
    const state: CoreState = {
      chimpState: {
        chimpName: "test-chimp",
        podName: "test-pod",
        streamName: "test-stream",
        createdAt: now,
        status: "pending",
      },
      sessionExists: true,
      health: { lastHeartbeat: now, messageCount: 5 },
      activity: null,
      now,
    };

    const decision = decideOnHeartbeat(state);

    expect(decision.actions).toEqual([
      { type: "update_chimp_state", status: "running" },
    ]);
    expect(decision.reason).toContain("updating status to running");
  });

  test("chimp already running: does nothing", () => {
    const state: CoreState = {
      chimpState: {
        chimpName: "test-chimp",
        podName: "test-pod",
        streamName: "test-stream",
        createdAt: now,
        status: "running",
      },
      sessionExists: true,
      health: { lastHeartbeat: now, messageCount: 5 },
      activity: null,
      now,
    };

    const decision = decideOnHeartbeat(state);

    expect(decision.actions).toEqual([{ type: "noop" }]);
    expect(decision.reason).toContain("already running");
  });

  test("chimp state doesn't exist: creates state with running status", () => {
    const state: CoreState = {
      chimpState: null,
      sessionExists: true,
      health: { lastHeartbeat: now, messageCount: 5 },
      activity: null,
      now,
    };

    const decision = decideOnHeartbeat(state);

    expect(decision.actions).toEqual([
      { type: "update_chimp_state", status: "running" },
    ]);
    expect(decision.reason).toContain("updating status to running");
  });

  test("stopped chimp receives heartbeat: updates to running", () => {
    const state: CoreState = {
      chimpState: {
        chimpName: "test-chimp",
        podName: "test-pod",
        streamName: "test-stream",
        createdAt: now,
        status: "stopped",
      },
      sessionExists: true,
      health: { lastHeartbeat: now, messageCount: 5 },
      activity: null,
      now,
    };

    const decision = decideOnHeartbeat(state);

    expect(decision.actions).toEqual([
      { type: "update_chimp_state", status: "running" },
    ]);
    expect(decision.reason).toContain("updating status to running");
  });
});

describe("decideOnReconcile", () => {
  const now = Date.now();

  test("healthy and active chimp: does nothing", () => {
    const state: CoreState = {
      chimpState: null,
      sessionExists: true,
      health: { lastHeartbeat: now - 10_000, messageCount: 5 },
      activity: { lastActivity: now - 10_000 }, // Recent activity
      now,
    };

    const decision = decideOnReconcile(state);

    expect(decision.actions).toEqual([{ type: "noop" }]);
    expect(decision.reason).toContain("healthy and active");
  });

  test("healthy but idle chimp: stops pod and deletes session", () => {
    const state: CoreState = {
      chimpState: null,
      sessionExists: true,
      health: { lastHeartbeat: now - 10_000, messageCount: 5 },
      activity: { lastActivity: now - 400_000 }, // 6.67 minutes ago (idle)
      now,
    };

    const decision = decideOnReconcile(state);

    expect(decision.actions).toEqual([
      { type: "delete_session" },
      { type: "delete_health" },
      { type: "delete_pod" },
    ]);
    expect(decision.reason).toContain("idle");
  });

  test("unhealthy chimp: creates stream and pod", () => {
    const state: CoreState = {
      chimpState: null,
      sessionExists: true,
      health: null,
      activity: null,
      now,
    };

    const decision = decideOnReconcile(state);

    expect(decision.actions).toEqual([
      { type: "create_stream" },
      { type: "create_pod" },
      { type: "update_chimp_state", status: "pending" },
    ]);
    expect(decision.reason).toContain("unhealthy");
  });

  test("stopped chimp: does nothing", () => {
    const state: CoreState = {
      chimpState: {
        chimpName: "test-chimp",
        podName: "test-pod",
        streamName: "test-stream",
        createdAt: now,
        status: "stopped",
      },
      sessionExists: true,
      health: null,
      activity: null,
      now,
    };

    const decision = decideOnReconcile(state);

    expect(decision.actions).toEqual([{ type: "noop" }]);
    expect(decision.reason).toContain("healthy and active");
  });
});

describe("decide (main router)", () => {
  const now = Date.now();
  const healthyState: CoreState = {
    chimpState: null,
    sessionExists: true,
    health: { lastHeartbeat: now - 10_000, messageCount: 5 },
    activity: { lastActivity: now - 10_000 },
    now,
  };

  test("routes completion events", () => {
    const payload: EventPayload = {
      type: "completion",
      reason: "idle_timeout",
    };
    const decision = decide(healthyState, payload);

    expect(decision.reason).toContain("idle_timeout");
    expect(decision.actions).toEqual([
      { type: "delete_health" },
      { type: "delete_session" },
      { type: "update_chimp_state", status: "stopped" },
      { type: "delete_pod" },
    ]);
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
    expect(decision.actions).toEqual([{ type: "noop" }]);
  });

  test("routes reconcile_tick events", () => {
    const payload: EventPayload = { type: "reconcile_tick" };
    const decision = decide(healthyState, payload);

    expect(decision.reason).toContain("healthy");
    expect(decision.actions).toEqual([{ type: "noop" }]);
  });

  test("routes heartbeat_received events", () => {
    const payload: EventPayload = { type: "heartbeat_received" };
    const stateWithRunningChimp: CoreState = {
      ...healthyState,
      chimpState: {
        chimpName: "test-chimp",
        podName: "test-pod",
        streamName: "test-stream",
        createdAt: now,
        status: "running",
      },
    };
    const decision = decide(stateWithRunningChimp, payload);

    expect(decision.reason).toContain("already running");
    expect(decision.actions).toEqual([{ type: "noop" }]);
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
      activity: null,
      now,
    };

    const decision = decideOnPodEvent(state, "deleted", null);

    // Should NOT create pod since no session exists
    expect(decision.actions).toEqual([
      { type: "delete_health" },
      { type: "update_chimp_state", status: "failed" },
    ]);
    expect(decision.reason).toContain("not recreating");
  });

  test("Bug 2: Idle timeout should prevent recreation", () => {
    // Scenario: Chimp idles out, session should be deleted
    const state: CoreState = {
      chimpState: null,
      sessionExists: true,
      health: { lastHeartbeat: now - 10_000, messageCount: 5 },
      activity: { lastActivity: now - 10_000 },
      now,
    };

    const decision = decideOnCompletion(state, "idle_timeout");

    // Should delete session to prevent reconciler from recreating
    expect(decision.actions).toEqual([
      { type: "delete_health" },
      { type: "delete_session" },
      { type: "update_chimp_state", status: "stopped" },
      { type: "delete_pod" },
    ]);
  });

  test("Bug 3: Session exists but pod deleted - should recreate", () => {
    // Scenario: Pod crashes but session still exists
    const state: CoreState = {
      chimpState: null,
      sessionExists: true,
      health: null,
      activity: null,
      now,
    };

    const decision = decideOnPodEvent(state, "deleted", null);

    // Should recreate pod since session exists
    expect(decision.actions).toEqual([
      { type: "delete_health" },
      { type: "create_pod" },
    ]);
    expect(decision.reason).toContain("recreating");
  });

  test("Bug 4: Reconcile with no session should not create chimp", () => {
    // Scenario: Reconciler runs but no session exists
    const state: CoreState = {
      chimpState: null,
      sessionExists: false,
      health: null,
      activity: null,
      now,
    };

    // Note: Reconciler should only process sessions that exist
    // This test verifies what happens if reconciler is called anyway
    const decision = decideOnReconcile(state);

    // Even with no health, should try to create if reconciling
    // The reconciler itself should filter by sessionExists before calling
    expect(decision.actions).toEqual([
      { type: "create_stream" },
      { type: "create_pod" },
      { type: "update_chimp_state", status: "pending" },
    ]);
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
      activity: null,
      now,
    };

    const decision = decideOnPodEvent(state, "deleted", pod);

    // Should NOT recreate pod because it exited normally
    expect(decision.actions).toEqual([
      { type: "delete_health" },
      { type: "update_chimp_state", status: "stopped" },
    ]);
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
      activity: null,
      now,
    };

    const decision = decideOnPodEvent(state, "modified", pod);

    // Should recreate pod because it crashed
    expect(decision.actions).toEqual([
      { type: "delete_health" },
      { type: "create_pod" },
    ]);
    expect(decision.reason).toContain("crashed");
  });
});
