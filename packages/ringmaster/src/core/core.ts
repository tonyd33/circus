import type * as k8s from "@kubernetes/client-node";
import { type Protocol, Standards } from "@mnke/circus-shared";

type Topic = Standards.Topic.Topic;

export interface CoreState {
  now: number;
  pod: k8s.V1Pod | undefined;
}

export type EventPayload =
  | {
      type: "pod_event";
      chimpId: string;
      profile: string;
      eventType: string;
      pod: k8s.V1Pod;
    }
  | {
      type: "event_received";
      chimpId: string;
      profile: string;
      eventSubject: string;
      topic: Topic | null;
      topicOwner: { chimpId: string } | null;
      messageSequence: number;
    }
  | {
      type: "chimp_output";
      chimpId: string;
      message: Protocol.ChimpOutputMessage;
    };

export type Action =
  | { type: "create_job"; profile: string }
  | {
      type: "create_consumers";
      profile: string;
      eventFilterSubjects: string[];
      startSequence: number;
    }
  | { type: "register_topic"; topic: Topic; force?: boolean }
  | { type: "delete_consumers" }
  | { type: "cleanup_topics" }
  | {
      type: "upsert_state";
      profile: string;
      status: Standards.Chimp.ChimpStatus;
    }
  | {
      type: "upsert_status";
      profile: string;
      status: Standards.Chimp.ChimpStatus;
    }
  | { type: "delete_job" }
  | { type: "delete_state" }
  | { type: "noop" };

export interface Decision {
  chimpId: string;
  actions: Action[];
  reason: string;
}

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

export function deriveChimpId(
  topic: Topic | null,
  eventSubject: string,
): string {
  const key = topic
    ? Standards.Topic.serializeTopic(topic)
    : eventSubject.slice(Standards.Chimp.Prefix.EVENTS.length + 1);
  return `evt-${Bun.hash(key).toString(36)}`;
}

function decideOnPodEvent(
  chimpId: string,
  profile: string,
  eventType: string,
  pod: k8s.V1Pod,
): Decision {
  if (eventType === "DELETED") {
    return { chimpId, actions: [], reason: "Pod deleted" };
  }

  const phase = pod.status?.phase;
  const status = podPhaseToStatus(phase);

  return {
    chimpId,
    actions: [{ type: "upsert_status", profile, status }],
    reason: `Pod ${eventType} phase ${phase}`,
  };
}

function decideOnEventReceived(
  state: CoreState,
  payload: EventPayload & { type: "event_received" },
): Decision {
  const { chimpId, profile, topic, topicOwner, messageSequence, eventSubject } =
    payload;

  if (topicOwner && state.pod) {
    return {
      chimpId,
      actions: [{ type: "noop" }],
      reason: `Event topic already claimed by ${chimpId}`,
    };
  }

  const topicFilter = topic
    ? Standards.Topic.topicToEventSubject(topic)
    : eventSubject;

  const actions: Action[] = [];

  if (!state.pod) {
    actions.push({ type: "upsert_state", profile, status: "scheduled" });
  }

  actions.push({
    type: "create_consumers",
    profile,
    eventFilterSubjects: [topicFilter],
    startSequence: messageSequence,
  });

  const isReclaim = topicOwner != null && !state.pod;
  if (topic) {
    actions.push({ type: "register_topic", topic, force: isReclaim });
  }

  actions.push({ type: "create_job", profile });

  return {
    chimpId,
    actions,
    reason: state.pod
      ? "Unclaimed event, pod exists — ensuring consumers and job"
      : "Unclaimed event, no pod — scheduling new chimp",
  };
}

function decideOnChimpOutput(
  chimpId: string,
  message: Protocol.ChimpOutputMessage,
): Decision {
  switch (message.type) {
    case "transmogrify":
      return {
        chimpId,
        actions: [
          {
            type: "upsert_state",
            profile: message.targetProfile,
            status: "scheduled",
          },
          { type: "delete_job" },
          { type: "create_job", profile: message.targetProfile },
        ],
        reason: `Transmogrify: replacing with profile ${message.targetProfile}`,
      };
    default:
      return {
        chimpId,
        actions: [{ type: "noop" }],
        reason: `Output: ${message.type}`,
      };
  }
}

export function decide(state: CoreState, payload: EventPayload): Decision {
  switch (payload.type) {
    case "pod_event":
      return decideOnPodEvent(
        payload.chimpId,
        payload.profile,
        payload.eventType,
        payload.pod,
      );
    case "event_received":
      return decideOnEventReceived(state, payload);
    case "chimp_output":
      return decideOnChimpOutput(payload.chimpId, payload.message);
  }
}
