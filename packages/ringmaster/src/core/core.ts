import type * as k8s from "@kubernetes/client-node";
import { type Protocol, Standards } from "@mnke/circus-shared";

type Topic = Standards.Topic.Topic;
type TopicSubscription = Standards.Topic.TopicSubscription;

// ─── Queries ───────────────────────────────────────────────────────────

export type Query =
  | { type: "lookup_topic"; topic: Topic }
  | { type: "get_pod"; chimpId: string }
  | { type: "get_chimp_state"; chimpId: string }
  | { type: "get_chimp_profile"; chimpId: string };

export type QueryResultMap = {
  lookup_topic: TopicSubscription[];
  get_pod: k8s.V1Pod | undefined;
  get_chimp_state: Standards.Chimp.ChimpState | null;
  get_chimp_profile: string;
};

export type QueryResult<Q extends Query> = QueryResultMap[Q["type"]];

// ─── Actions ───────────────────────────────────────────────────────────

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
  | {
      chimpId: string;
      type: "upsert_status";
      status: Standards.Chimp.ChimpStatus;
      profile?: string;
      topics?: Topic[];
    }
  | { chimpId: string; type: "delete_job" }
  | { chimpId: string; type: "delete_state" }
  | {
      chimpId: string;
      type: "send_command";
      command: Protocol.ChimpCommand;
    };

// ─── Effects ───────────────────────────────────────────────────────────

export type Effect =
  | { type: "pure"; actions: Action[] }
  | {
      type: "query";
      query: Query;
      cont: (result: never) => Effect;
    };

export const Fx = {
  pure(actions: Action[]): Effect {
    return { type: "pure", actions };
  },
  query<Q extends Query>(
    query: Q,
    cont: (result: QueryResult<Q>) => Effect,
  ): Effect {
    return { type: "query", query, cont: cont as (r: never) => Effect };
  },
};

// ─── Event payloads (raw, no pre-fetched data) ─────────────────────────

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
      subject: string;
      seq: number;
    }
  | {
      type: "chimp_output";
      chimpId: string;
      message: Protocol.ChimpOutputMessage;
      timestamp: Date;
    };

// ─── Pure helpers ──────────────────────────────────────────────────────

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
    : Standards.Topic.parseEventSubject(eventSubject);
  if (!key) {
    return `evt-${Bun.hash(eventSubject).toString(36)}`;
  }
  return `evt-${Bun.hash(key).toString(36)}`;
}

// ─── Decision builders ─────────────────────────────────────────────────

function buildSpawnActions(
  chimpId: string,
  profile: string,
  eventSubject: string,
  topic: Topic | null,
  pod: k8s.V1Pod | undefined,
  seq: number,
): Action[] {
  const topicFilter = topic
    ? Standards.Topic.topicToEventSubject(topic)
    : eventSubject;

  const directTopic: Topic = { platform: "direct", chimpId };
  const directFilter = Standards.Topic.topicToEventSubject(directTopic);

  const filterSubjects =
    topicFilter === directFilter ? [directFilter] : [topicFilter, directFilter];

  // All topics this chimp will be registered for: always the direct topic,
  // plus the triggering topic if it's different.
  const topics: Topic[] = topic ? [topic, directTopic] : [directTopic];
  const actions: Action[] = [];

  if (!pod) {
    actions.push({
      chimpId,
      type: "upsert_status",
      status: "scheduled",
      profile,
      topics,
    });
  }

  actions.push({
    chimpId,
    type: "create_consumers",
    eventFilterSubjects: filterSubjects,
    deliverFrom: { type: "sequence", value: seq },
  });

  actions.push({ chimpId, type: "register_topic", topic: directTopic });

  if (topic) {
    actions.push({ chimpId, type: "register_topic", topic });
  }

  actions.push({ chimpId, type: "create_job", profile });

  return actions;
}

/**
 * Query profile then build spawn actions for a chimpId.
 */
function spawnWithProfile(
  chimpId: string,
  subject: string,
  topic: Topic | null,
  pod: k8s.V1Pod | undefined,
  seq: number,
): Effect {
  return Fx.query({ type: "get_chimp_profile", chimpId }, (profile) =>
    Fx.pure(buildSpawnActions(chimpId, profile, subject, topic, pod, seq)),
  );
}

// ─── Decision functions ────────────────────────────────────────────────

function decideOnPodEvent(
  payload: EventPayload & { type: "pod_event" },
): Effect {
  if (payload.eventType === "DELETED") {
    return Fx.pure([]);
  }

  const status = podPhaseToStatus(payload.pod.status?.phase);
  const actions: Action[] = [
    { chimpId: payload.chimpId, type: "upsert_status", status },
  ];

  return Fx.pure(actions);
}

function decideOnEventReceived(
  payload: EventPayload & { type: "event_received" },
): Effect {
  const topic = Standards.Topic.eventSubjectToTopic(payload.subject);

  if (!topic) {
    const chimpId = deriveChimpId(null, payload.subject);
    return Fx.query({ type: "get_pod", chimpId }, (pod) =>
      spawnWithProfile(chimpId, payload.subject, null, pod, payload.seq),
    );
  }

  return Fx.query({ type: "lookup_topic", topic }, (subscribers) => {
    if (subscribers.length === 0) {
      const chimpId = deriveChimpId(topic, payload.subject);
      return Fx.query({ type: "get_pod", chimpId }, (pod) =>
        spawnWithProfile(chimpId, payload.subject, topic, pod, payload.seq),
      );
    }

    return buildSubscriberEffects(
      subscribers,
      payload.subject,
      topic,
      payload.seq,
    );
  });
}

/**
 * For each subscriber, check if their pod is running.
 * If not, query their profile and build reclaim actions.
 */
function buildSubscriberEffects(
  subscribers: TopicSubscription[],
  subject: string,
  topic: Topic,
  seq: number,
  collectedActions: Action[] = [],
): Effect {
  const [first, ...rest] = subscribers;
  if (first == null) {
    return Fx.pure(collectedActions);
  }

  return Fx.query({ type: "get_pod", chimpId: first.chimpId }, (pod) => {
    if (pod) {
      // Pod running — no action needed for this subscriber
      if (rest.length === 0) return Fx.pure(collectedActions);
      return buildSubscriberEffects(
        rest,
        subject,
        topic,
        seq,
        collectedActions,
      );
    }

    // No pod — query profile and reclaim
    return Fx.query(
      { type: "get_chimp_profile", chimpId: first.chimpId },
      (profile) => {
        const actions = [
          ...collectedActions,
          ...buildSpawnActions(
            first.chimpId,
            profile,
            subject,
            topic,
            pod,
            seq,
          ),
        ];

        if (rest.length === 0) return Fx.pure(actions);
        return buildSubscriberEffects(rest, subject, topic, seq, actions);
      },
    );
  });
}

function decideOnChimpOutput(
  payload: EventPayload & { type: "chimp_output" },
): Effect {
  const { message, timestamp } = payload;

  switch (message.type) {
    case "chimp-request": {
      const directTopic: Topic = {
        platform: "direct",
        chimpId: message.chimpId,
      };
      return Fx.pure([
        {
          chimpId: message.chimpId,
          type: "upsert_status",
          status: "scheduled",
          profile: message.profile,
          topics: [directTopic],
        },
        {
          chimpId: message.chimpId,
          type: "create_consumers",
          eventFilterSubjects: [
            Standards.Topic.topicToEventSubject(directTopic),
          ],
          deliverFrom: { type: "time", value: timestamp },
        },
        {
          chimpId: message.chimpId,
          type: "register_topic",
          topic: directTopic,
        },
        {
          chimpId: message.chimpId,
          type: "create_job",
          profile: message.profile,
        },
      ]);
    }
    default:
      return Fx.pure([]);
  }
}

// ─── Main entry point ──────────────────────────────────────────────────

export function decide(payload: EventPayload): Effect {
  switch (payload.type) {
    case "pod_event":
      return decideOnPodEvent(payload);
    case "event_received":
      return decideOnEventReceived(payload);
    case "chimp_output":
      return decideOnChimpOutput(payload);
  }
}
