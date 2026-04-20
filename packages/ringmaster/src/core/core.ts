import type * as k8s from "@kubernetes/client-node";
import { type Protocol, Standards } from "@mnke/circus-shared";

type Topic = Standards.Topic.Topic;
type TopicSubscription = Standards.Topic.TopicSubscription;

export interface CoreState {
  now: number;
  pod: k8s.V1Pod | undefined;
  topicOwner: TopicSubscription | null;
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
      profile: string;
      eventSubject: string;
      topic: Topic | null;
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
  | { type: "register_topic"; topic: Topic; profile: string; force?: boolean }
  | { type: "delete_consumers" }
  | { type: "cleanup_topics" }
  | {
      type: "upsert_state";
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
  _state: CoreState,
  chimpId: string,
  profile: string,
  eventType: string,
  pod: k8s.V1Pod,
): Decision {
  const phase = pod.status?.phase;
  const status = podPhaseToStatus(phase);

  if (eventType === "DELETED") {
    return {
      chimpId,
      actions: [
        { type: "delete_consumers" },
        { type: "cleanup_topics" },
        { type: "upsert_state", profile, status: "stopped" },
      ],
      reason: "Pod deleted",
    };
  }

  return {
    chimpId,
    actions: [{ type: "upsert_state", profile, status }],
    reason: "Pod phase changed",
  };
}

function decideOnEventReceived(
  state: CoreState,
  profile: string,
  eventSubject: string,
  topic: Topic | null,
  messageSequence: number,
): Decision {
  if (state.topicOwner && state.pod) {
    return {
      chimpId: state.topicOwner.chimpId,
      actions: [{ type: "noop" }],
      reason: `Event topic already claimed by ${state.topicOwner.chimpId}`,
    };
  }

  // If topicOwner exists but no pod, reuse the chimpId for continuity
  const chimpId = state.topicOwner
    ? state.topicOwner.chimpId
    : deriveChimpId(topic, eventSubject);
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

  const isReclaim = state.topicOwner != null && !state.pod;
  if (topic) {
    actions.push({ type: "register_topic", topic, profile, force: isReclaim });
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
        state,
        payload.chimpId,
        payload.profile,
        payload.eventType,
        payload.pod,
      );
    case "event_received":
      return decideOnEventReceived(
        state,
        payload.profile,
        payload.eventSubject,
        payload.topic,
        payload.messageSequence,
      );
    case "chimp_output":
      return decideOnChimpOutput(payload.chimpId, payload.message);
  }
}
