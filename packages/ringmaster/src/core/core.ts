/**
 * Ringmaster - Pure Core Logic
 *
 * This module contains pure business logic with no side effects.
 * All functions are deterministic and testable.
 */

import type * as k8s from "@kubernetes/client-node";
import type { Standards } from "@mnke/circus-shared";

/**
 * Core state - minimal stub for decision making
 */
export interface CoreState {
  now: number;
  pod: k8s.V1Pod | undefined;
}

/**
 * Event-specific payloads
 */
export type EventPayload =
  | {
      type: "pod_event";
      profile: string;
      eventType: string;
      pod: k8s.V1Pod;
    }
  | {
      type: "message_received";
      profile: string;
      messageSequence: number;
    };

/**
 * Actions that the effectful layer should perform
 */
export type Action =
  | { type: "create_job"; profile: string }
  | { type: "create_consumer"; profile: string; startSequence: number }
  | { type: "delete_consumer" }
  | {
      type: "upsert_state";
      profile: string;
      status: Standards.Chimp.ChimpStatus;
    }
  | { type: "delete_state" }
  | { type: "noop" };

/**
 * Map K8s pod phase to Standards.Chimp.ChimpStatus
 */
function podPhaseToStatus(
  phase: string | undefined,
): Standards.Chimp.ChimpStatus {
  switch (phase) {
    case "Pending":
      return "pending";
    case "Running":
      return "running";
    case "Succeeded":
      return "stopped";
    case "Failed":
      return "failed";
    default:
      return "unknown";
  }
}

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
 * Decide what to do when a pod event occurs
 */
export function decideOnPodEvent(
  state: CoreState,
  profile: string,
  eventType: string,
  pod: k8s.V1Pod,
): Decision {
  const phase = pod.status?.phase;
  const status = podPhaseToStatus(phase);

  if (eventType === "DELETED") {
    return {
      actions: [
        { type: "delete_consumer" },
        { type: "upsert_state", profile, status: "stopped" },
      ],
      reason: "Pod deleted - deleting consumer and state",
    };
  }

  return {
    actions: [{ type: "upsert_state", profile, status }],
    reason: `Pod ${eventType} with phase ${phase} - updating state to ${status}`,
  };
}

/**
 * Decide what to do when a message is received
 */
export function decideOnMessageReceived(
  state: CoreState,
  profile: string,
  messageSequence: number,
): Decision {
  if (!state.pod) {
    return {
      actions: [
        { type: "upsert_state", profile, status: "scheduled" },
        { type: "create_consumer", profile, startSequence: messageSequence },
        { type: "create_job", profile },
      ],
      reason: "Message received, no pod exists - scheduling",
    };
  }

  return {
    actions: [
      { type: "create_consumer", profile, startSequence: messageSequence },
      { type: "create_job", profile },
    ],
    reason: "Message received, pod exists - ensuring consumer and job",
  };
}

/**
 * Main decision function that routes to specific handlers
 */
export function decide(state: CoreState, payload: EventPayload): Decision {
  switch (payload.type) {
    case "pod_event":
      return decideOnPodEvent(
        state,
        payload.profile,
        payload.eventType,
        payload.pod,
      );

    case "message_received":
      return decideOnMessageReceived(
        state,
        payload.profile,
        payload.messageSequence,
      );
  }
}
