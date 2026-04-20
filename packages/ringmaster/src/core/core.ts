import type * as k8s from "@kubernetes/client-node";
import { Standards } from "@mnke/circus-shared";

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
    };

export type Action =
  | { type: "create_job"; profile: string }
  | {
      type: "create_consumers";
      profile: string;
      eventFilterSubjects: string[];
      startSequence: number;
    }
  | { type: "register_topic"; topic: Topic; profile: string }
  | { type: "delete_consumers" }
  | { type: "cleanup_topics" }
  | {
      type: "upsert_state";
      profile: string;
      status: Standards.Chimp.ChimpStatus;
    }
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

export function decideOnPodEvent(
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
      reason: "Pod deleted — cleaning up consumers, topics, and state",
    };
  }

  return {
    chimpId,
    actions: [{ type: "upsert_state", profile, status }],
    reason: `Pod ${eventType} with phase ${phase} — updating state to ${status}`,
  };
}

export function decideOnEventReceived(
  state: CoreState,
  profile: string,
  eventSubject: string,
  topic: Topic | null,
  messageSequence: number,
): Decision {
  if (state.topicOwner) {
    return {
      chimpId: state.topicOwner.chimpId,
      actions: [{ type: "noop" }],
      reason: `Event topic already claimed by ${state.topicOwner.chimpId}`,
    };
  }

  const chimpId = deriveChimpId(topic, eventSubject);
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

  if (topic) {
    actions.push({ type: "register_topic", topic, profile });
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

export function decide(
  state: CoreState,
  chimpId: string,
  payload: EventPayload,
): Decision {
  switch (payload.type) {
    case "pod_event":
      return decideOnPodEvent(
        state,
        chimpId,
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
  }
}
