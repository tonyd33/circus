/**
 * Ringmaster - Pure Core Logic
 *
 * This module contains pure business logic with no side effects.
 * All functions are deterministic and testable.
 */

import type * as k8s from "@kubernetes/client-node";
import type { ChimpHealth, ChimpState } from "./types.ts";

/**
 * Core state - always includes ChimpState (if exists) + event-specific data
 */
export interface CoreState {
  /** ChimpState from Redis (null if doesn't exist) */
  chimpState: ChimpState | null;
  /** Whether a session exists in Redis for this chimp */
  sessionExists: boolean;
  /** Health data from Redis (null if expired/missing) */
  health: ChimpHealth | null;
  /** Timestamp when this snapshot was taken */
  now: number;
}

/**
 * Get pod phase from pod object
 */
export function getPodPhase(pod?: k8s.V1Pod | null): string {
  return pod?.status?.phase || "Unknown";
}

/**
 * Event-specific payloads
 */
export type EventPayload =
  | { type: "completion"; reason: "idle_timeout" | "explicit_stop" | "error" }
  | {
      type: "pod_event";
      event: "added" | "modified" | "deleted" | "failed";
      pod: k8s.V1Pod | null;
    }
  | { type: "message_received" }
  | { type: "reconcile_tick" };

/**
 * Check if a pod exited normally (Succeeded phase with exit code 0)
 */
export function didPodExitNormally(pod?: k8s.V1Pod | null): boolean {
  if (!pod) {
    return false;
  }

  // Check if pod phase is Succeeded (normal exit)
  if (pod.status?.phase === "Succeeded") {
    return true;
  }

  // Also check container statuses for exit code 0
  const containerStatuses = pod.status?.containerStatuses || [];
  for (const status of containerStatuses) {
    // Check terminated state with exit code 0
    if (status.state?.terminated?.exitCode === 0) {
      return true;
    }
  }

  return false;
}

/**
 * Actions that the effectful layer should perform
 */
export type Action =
  | { type: "create_pod" }
  | { type: "delete_pod" }
  | { type: "create_stream" }
  | { type: "delete_stream" }
  | { type: "delete_session" }
  | { type: "delete_health" }
  | {
      type: "update_chimp_state";
      status: "pending" | "running" | "stopped" | "failed" | "unknown";
    }
  | { type: "noop" };

/**
 * Decision result from pure logic
 */
export interface Decision {
  /** Actions to perform in order */
  actions: Action[];
  /** Human-readable reason for the decision */
  reason: string;
}

/**
 * Health check configuration
 */
export interface HealthConfig {
  /** Maximum age of heartbeat in milliseconds before considered unhealthy */
  maxHeartbeatAge: number;
}

/**
 * Default health configuration
 */
export const DEFAULT_HEALTH_CONFIG: HealthConfig = {
  maxHeartbeatAge: 30_000, // 30 seconds
};

/**
 * Check if a chimp is healthy based on its health data
 */
export function isHealthy(
  health: ChimpHealth | null,
  now: number,
  config: HealthConfig = DEFAULT_HEALTH_CONFIG,
): boolean {
  if (!health) {
    return false;
  }

  const age = now - health.lastHeartbeat;
  return age < config.maxHeartbeatAge;
}

/**
 * Decide what to do when a chimp completes
 */
export function decideOnCompletion(
  state: CoreState,
  reason: "idle_timeout" | "explicit_stop" | "error",
): Decision {
  const actions: Action[] = [];

  // Always delete health when chimp completes
  actions.push({ type: "delete_health" });

  // If idle timeout, delete session to prevent recreation
  if (reason === "idle_timeout") {
    actions.push({ type: "delete_session" });
  }

  // Update state to mark as unknown
  actions.push({ type: "update_chimp_state", status: "unknown" });

  // Delete pod (will be recreated on demand if session still exists)
  actions.push({ type: "delete_pod" });

  return {
    actions,
    reason: `Chimp completed with reason: ${reason}`,
  };
}

/**
 * Decide what to do when a pod event occurs
 */
export function decideOnPodEvent(
  state: CoreState,
  event: "added" | "modified" | "deleted" | "failed",
  pod: k8s.V1Pod | null,
): Decision {
  const normalExit = didPodExitNormally(pod);
  const phase = getPodPhase(pod);

  switch (event) {
    case "added":
      // Pod was created - update state to pending/running
      return {
        actions: [
          {
            type: "update_chimp_state",
            status: phase === "Running" ? "running" : "pending",
          },
        ],
        reason: "Pod was added",
      };

    case "modified":
      // Pod status changed
      if (phase === "Failed" || phase === "Unknown") {
        // Pod failed - clear health and maybe recreate
        const actions: Action[] = [{ type: "delete_health" }];

        // Only recreate if:
        // 1. Session exists AND
        // 2. Pod did NOT exit normally (crashed or killed)
        if (state.sessionExists && !normalExit) {
          actions.push({ type: "create_pod" });
          return {
            actions,
            reason: "Pod crashed and session exists - recreating",
          };
        }

        return {
          actions,
          reason: normalExit
            ? "Pod exited normally (idle timeout/explicit stop) - not recreating"
            : "Pod failed but no session - not recreating",
        };
      }

      return {
        actions: [
          {
            type: "update_chimp_state",
            status: phase === "Running" ? "running" : "pending",
          },
        ],
        reason: "Pod status changed",
      };

    case "deleted": {
      // Pod was deleted (manually or by K8s)
      const actions: Action[] = [{ type: "delete_health" }];

      // Only recreate if session exists AND pod didn't exit normally
      if (state.sessionExists && !normalExit) {
        actions.push({ type: "create_pod" });
        return {
          actions,
          reason: "Pod deleted unexpectedly and session exists - recreating",
        };
      }

      // Determine appropriate status based on exit reason
      const status = normalExit ? "stopped" : "failed";

      return {
        actions: [
          { type: "delete_health" },
          { type: "update_chimp_state", status },
        ],
        reason: normalExit
          ? "Pod exited normally - not recreating"
          : "Pod deleted and no session - not recreating",
      };
    }

    case "failed":
      // Redundant with modified, but kept for clarity
      return decideOnPodEvent(state, "modified", pod);
  }
}

/**
 * Decide what to do when a message is received
 */
export function decideOnMessageReceived(
  state: CoreState,
  config: HealthConfig = DEFAULT_HEALTH_CONFIG,
): Decision {
  // If already healthy, do nothing
  if (isHealthy(state.health, state.now, config)) {
    return {
      actions: [{ type: "noop" }],
      reason: "Chimp is already healthy",
    };
  }

  // Chimp is unhealthy or missing - create it
  return {
    actions: [
      { type: "create_stream" },
      { type: "create_pod" },
      { type: "update_chimp_state", status: "pending" },
    ],
    reason: "Message received but chimp is unhealthy - creating on-demand",
  };
}

/**
 * Decide what to do during reconciliation for a single chimp
 */
export function decideOnReconcile(
  state: CoreState,
  config: HealthConfig = DEFAULT_HEALTH_CONFIG,
): Decision {
  // If healthy, do nothing
  if (isHealthy(state.health, state.now, config)) {
    return {
      actions: [{ type: "noop" }],
      reason: "Chimp is healthy",
    };
  }

  // Chimp is unhealthy or missing - ensure it exists
  return {
    actions: [
      { type: "create_stream" },
      { type: "create_pod" },
      { type: "update_chimp_state", status: "pending" },
    ],
    reason: "Chimp is unhealthy during reconciliation - recreating",
  };
}

/**
 * Main decision function that routes to specific handlers
 */
export function decide(
  state: CoreState,
  payload: EventPayload,
  config: HealthConfig = DEFAULT_HEALTH_CONFIG,
): Decision {
  switch (payload.type) {
    case "completion":
      return decideOnCompletion(state, payload.reason);

    case "pod_event":
      return decideOnPodEvent(state, payload.event, payload.pod);

    case "message_received":
      return decideOnMessageReceived(state, config);

    case "reconcile_tick":
      return decideOnReconcile(state, config);
  }
}
