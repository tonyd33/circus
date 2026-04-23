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
      topicSubscribers: { chimpId: string }[];
      messageSequence: number;
    }
  | {
      type: "chimp_output";
      chimpId: string;
      profile: string;
      message: Protocol.ChimpOutputMessage;
      timestamp: Date;
    };

export type Action =
  | { chimpId: string; type: "create_job"; profile: string }
  | {
      chimpId: string;
      type: "create_consumers";
      eventFilterSubjects: string[];
      deliverFrom:
        | { type: "sequence"; value: number }
        | { type: "time"; value: Date };
    }
  | { chimpId: string; type: "register_topic"; topic: Topic }
  | { chimpId: string; type: "delete_consumers" }
  | { chimpId: string; type: "cleanup_topics" }
  | {
      chimpId: string;
      type: "upsert_status";
      profile: string;
      status: Standards.Chimp.ChimpStatus;
    }
  | { chimpId: string; type: "delete_job" }
  | { chimpId: string; type: "delete_state" }
  | {
      chimpId: string;
      type: "send_command";
      command: Protocol.ChimpCommand;
    }
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
    actions: [{ chimpId, type: "upsert_status", profile, status }],
    reason: `Pod ${eventType} phase ${phase}`,
  };
}

function decideOnEventReceived(
  state: CoreState,
  payload: EventPayload & { type: "event_received" },
): Decision {
  const { chimpId, profile, topic, topicSubscribers, eventSubject } = payload;

  if (topicSubscribers.length > 0 && state.pod) {
    return {
      chimpId,
      actions: [{ type: "noop" }],
      reason: `Event topic already has subscribers, pod running for ${chimpId}`,
    };
  }

  const topicFilter = topic
    ? Standards.Topic.topicToEventSubject(topic)
    : eventSubject;

  const actions: Action[] = [];

  if (!state.pod) {
    actions.push({
      chimpId,
      type: "upsert_status",
      profile,
      status: "scheduled",
    });
  }

  actions.push({
    chimpId,
    type: "create_consumers",
    eventFilterSubjects: [topicFilter],
    deliverFrom: { type: "sequence", value: payload.messageSequence },
  });

  if (topic) {
    actions.push({ chimpId, type: "register_topic", topic });
  }

  actions.push({ chimpId, type: "create_job", profile });

  return {
    chimpId,
    actions,
    reason: state.pod
      ? "Unclaimed event, pod exists — ensuring consumers and job"
      : "Unclaimed event, no pod — scheduling new chimp",
  };
}

function decideOnChimpRequest(
  fromChimpId: string,
  message: Protocol.ChimpOutputMessage & { type: "chimp-request" },
  timestamp: Date,
): Decision {
  return {
    chimpId: message.chimpId,
    actions: [
      {
        chimpId: message.chimpId,
        type: "upsert_status",
        profile: message.profile,
        status: "scheduled",
      },
      {
        chimpId: message.chimpId,
        type: "create_consumers",
        eventFilterSubjects: [
          Standards.Chimp.Naming.directSubject(message.chimpId),
        ],
        deliverFrom: { type: "time", value: timestamp },
      },
      {
        chimpId: message.chimpId,
        type: "create_job",
        profile: message.profile,
      },
    ],
    reason: `Chimp ${fromChimpId} requested new chimp ${message.chimpId} (${message.profile})`,
  };
}

function decideOnChimpOutput(
  chimpId: string,
  _profile: string,
  message: Protocol.ChimpOutputMessage,
  timestamp: Date,
): Decision {
  switch (message.type) {
    case "chimp-request":
      return decideOnChimpRequest(chimpId, message, timestamp);
    default:
      return {
        chimpId,
        actions: [],
        reason: "Nothing to do",
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
      return decideOnChimpOutput(
        payload.chimpId,
        payload.profile,
        payload.message,
        payload.timestamp,
      );
  }
}
