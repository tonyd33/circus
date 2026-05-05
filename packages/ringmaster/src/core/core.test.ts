import { describe, expect, test } from "bun:test";
import type { Action, Effect, Query } from "./core.ts";
import { decide, deriveChimpId } from "./core.ts";

const P = "default";
const T = new Date("2026-04-22T00:00:00.000Z");

type QueryHandler = (query: Query) => unknown;

function interpret(effect: Effect, handler: QueryHandler): Action[] {
  switch (effect.type) {
    case "pure":
      return effect.actions;
    case "query": {
      const result = handler(effect.query);
      // biome-ignore lint/suspicious/noExplicitAny: effect cont boundary erases query result type
      const next = (effect.cont as (r: any) => Effect)(result);
      return interpret(next, handler);
    }
  }
}

/** Default handler: no subscribers, no pods, no state, default profile */
const emptyHandler: QueryHandler = (query) => {
  switch (query.type) {
    case "lookup_topic":
      return [];
    case "get_pod":
      return undefined;
    case "get_chimp_state":
      return null;
    case "get_chimp_profile":
      return P;
  }
};

function withPod(chimpId: string, pod: unknown): QueryHandler {
  return (query) => {
    if (query.type === "get_pod" && query.chimpId === chimpId) return pod;
    return emptyHandler(query);
  };
}

function withSubscribers(
  subscribers: { chimpId: string; subscribedAt: string }[],
  podForChimp?: Record<string, unknown>,
): QueryHandler {
  return (query) => {
    if (query.type === "lookup_topic") return subscribers;
    if (query.type === "get_pod" && podForChimp?.[query.chimpId])
      return podForChimp[query.chimpId];
    return emptyHandler(query);
  };
}

const eventSubject = "events.github.tonyd33.circus.pr.42.comment";
const topic = {
  platform: "github" as const,
  owner: "tonyd33",
  repo: "circus",
  type: "pr" as const,
  number: 42,
};

const podWithPhase = (phase: string) => ({ status: { phase } }) as never;

describe("pod_event", () => {
  test("DELETED: no actions", () => {
    const actions = interpret(
      decide({
        type: "pod_event",
        chimpId: "chimp-1",
        profile: P,
        eventType: "DELETED",
        pod: podWithPhase("Succeeded"),
      }),
      emptyHandler,
    );
    expect(actions).toEqual([]);
  });

  test("ADDED Running: upserts status", () => {
    const actions = interpret(
      decide({
        type: "pod_event",
        chimpId: "chimp-1",
        profile: P,
        eventType: "ADDED",
        pod: podWithPhase("Running"),
      }),
      emptyHandler,
    );
    expect(actions).toEqual([
      { chimpId: "chimp-1", type: "upsert_status", status: "running" },
    ]);
  });

  test("Pending → pending", () => {
    const actions = interpret(
      decide({
        type: "pod_event",
        chimpId: "chimp-1",
        profile: P,
        eventType: "ADDED",
        pod: podWithPhase("Pending"),
      }),
      emptyHandler,
    );
    expect(actions).toEqual([
      { chimpId: "chimp-1", type: "upsert_status", status: "pending" },
    ]);
  });

  test("Failed → failed", () => {
    const actions = interpret(
      decide({
        type: "pod_event",
        chimpId: "chimp-1",
        profile: P,
        eventType: "MODIFIED",
        pod: podWithPhase("Failed"),
      }),
      emptyHandler,
    );
    expect(actions).toEqual([
      { chimpId: "chimp-1", type: "upsert_status", status: "failed" },
    ]);
  });
});

describe("event_received", () => {
  test("unclaimed, no pod → schedules chimp with default profile", () => {
    const chimpId = deriveChimpId(topic, eventSubject);
    const actions = interpret(
      decide({ type: "event_received", subject: eventSubject, seq: 42 }),
      emptyHandler,
    );

    expect(actions[0]).toEqual({
      chimpId,
      type: "upsert_status",
      status: "scheduled",
    });

    expect(actions.find((a) => a.type === "set_profile")).toEqual({
      chimpId,
      type: "set_profile",
      profile: P,
    });

    expect(actions.find((a) => a.type === "set_topics")).toEqual({
      chimpId,
      type: "set_topics",
      topics: [topic, { platform: "direct", chimpId }],
    });

    const topicActions = actions.filter((a) => a.type === "register_topic");
    expect(topicActions).toEqual([
      {
        chimpId,
        type: "register_topic",
        topic: { platform: "direct", chimpId },
      },
      { chimpId, type: "register_topic", topic },
    ]);

    expect(actions.find((a) => a.type === "create_job")).toEqual({
      chimpId,
      type: "create_job",
      profile: P,
    });
  });

  test("unclaimed, pod exists → no upsert_status but creates consumers + job", () => {
    const chimpId = deriveChimpId(topic, eventSubject);
    const pod = { status: { phase: "Running" } };
    const actions = interpret(
      decide({ type: "event_received", subject: eventSubject, seq: 42 }),
      withPod(chimpId, pod),
    );

    expect(actions.find((a) => a.type === "upsert_status")).toBeUndefined();
    expect(actions.find((a) => a.type === "create_consumers")).toBeDefined();
    expect(actions.find((a) => a.type === "create_job")).toBeDefined();
  });

  test("subscriber with running pod → no actions", () => {
    const pod = { status: { phase: "Running" } };
    const actions = interpret(
      decide({ type: "event_received", subject: eventSubject, seq: 42 }),
      withSubscribers(
        [{ chimpId: "existing-chimp", subscribedAt: "2026-01-01" }],
        { "existing-chimp": pod },
      ),
    );

    expect(actions).toEqual([]);
  });

  test("subscriber without pod → reclaim", () => {
    const actions = interpret(
      decide({ type: "event_received", subject: eventSubject, seq: 42 }),
      withSubscribers([{ chimpId: "stale-chimp", subscribedAt: "2026-01-01" }]),
    );

    expect(actions.find((a) => a.type === "create_job")).toBeDefined();

    const topicActions = actions.filter((a) => a.type === "register_topic");
    expect(topicActions).toEqual([
      {
        chimpId: "stale-chimp",
        type: "register_topic",
        topic: { platform: "direct", chimpId: "stale-chimp" },
      },
      { chimpId: "stale-chimp", type: "register_topic", topic },
    ]);
  });

  test("direct subject with subscriber + pod → no actions", () => {
    const pod = { status: { phase: "Running" } };
    const actions = interpret(
      decide({
        type: "event_received",
        subject: "events.direct.some-chimp.cmd",
        seq: 1,
      }),
      withSubscribers([{ chimpId: "some-chimp", subscribedAt: "2026-01-01" }], {
        "some-chimp": pod,
      }),
    );

    expect(actions).toEqual([]);
  });

  test("debug event → registers debug topic", () => {
    const chimpId = deriveChimpId(
      { platform: "debug", sessionId: "abc123" },
      "",
    );
    const actions = interpret(
      decide({
        type: "event_received",
        subject: "events.debug.abc123.message",
        seq: 10,
      }),
      emptyHandler,
    );

    const topicActions = actions.filter((a) => a.type === "register_topic");
    expect(topicActions).toEqual([
      {
        chimpId,
        type: "register_topic",
        topic: { platform: "direct", chimpId },
      },
      {
        chimpId,
        type: "register_topic",
        topic: { platform: "debug", sessionId: "abc123" },
      },
    ]);
    expect(actions.find((a) => a.type === "create_job")).toBeDefined();
  });

  test("multiple subscribers, some with pods → only reclaims podless ones", () => {
    const pod = { status: { phase: "Running" } };
    const actions = interpret(
      decide({ type: "event_received", subject: eventSubject, seq: 42 }),
      withSubscribers(
        [
          { chimpId: "alive-chimp", subscribedAt: "2026-01-01" },
          { chimpId: "dead-chimp", subscribedAt: "2026-01-01" },
        ],
        { "alive-chimp": pod },
      ),
    );

    const jobActions = actions.filter((a) => a.type === "create_job");
    expect(jobActions).toHaveLength(1);
    expect(jobActions[0]!.chimpId).toBe("dead-chimp");
  });

  test("every spawned chimp gets direct topic in consumer and DB", () => {
    const chimpId = deriveChimpId(topic, eventSubject);
    const actions = interpret(
      decide({ type: "event_received", subject: eventSubject, seq: 42 }),
      emptyHandler,
    );

    const topicActions = actions.filter((a) => a.type === "register_topic");
    expect(topicActions).toEqual([
      {
        chimpId,
        type: "register_topic",
        topic: { platform: "direct", chimpId },
      },
      { chimpId, type: "register_topic", topic },
    ]);

    const consumerAction = actions.find((a) => a.type === "create_consumers");
    expect(consumerAction).toEqual({
      chimpId,
      type: "create_consumers",
      eventFilterSubjects: [
        "events.github.tonyd33.circus.pr.42.>",
        `events.direct.${chimpId}.>`,
      ],
      deliverFrom: { type: "sequence", value: 42 },
    });
  });
});

describe("orchestration_action", () => {
  test("set-profile → upsert_status + set_profile", () => {
    const actions = interpret(
      decide({
        type: "orchestration_action",
        timestamp: T,
        action: {
          type: "set-profile",
          chimpId: "new-chimp",
          profile: "worker",
        },
      }),
      emptyHandler,
    );

    expect(actions).toEqual([
      { chimpId: "new-chimp", type: "upsert_status", status: "scheduled" },
      { chimpId: "new-chimp", type: "set_profile", profile: "worker" },
    ]);
  });

  test("subscribe-topic → register_topic", () => {
    const directTopic = { platform: "direct" as const, chimpId: "new-chimp" };
    const actions = interpret(
      decide({
        type: "orchestration_action",
        timestamp: T,
        action: {
          type: "subscribe-topic",
          chimpId: "new-chimp",
          topic: directTopic,
        },
      }),
      emptyHandler,
    );

    expect(actions).toEqual([
      { chimpId: "new-chimp", type: "register_topic", topic: directTopic },
    ]);
  });

  test("unsubscribe-topic → unregister_topic", () => {
    const actions = interpret(
      decide({
        type: "orchestration_action",
        timestamp: T,
        action: {
          type: "unsubscribe-topic",
          chimpId: "c1",
          topic,
        },
      }),
      emptyHandler,
    );

    expect(actions).toEqual([
      { chimpId: "c1", type: "unregister_topic", topic },
    ]);
  });

  test("set-topics → set_topics", () => {
    const actions = interpret(
      decide({
        type: "orchestration_action",
        timestamp: T,
        action: {
          type: "set-topics",
          chimpId: "c1",
          topics: [topic],
        },
      }),
      emptyHandler,
    );

    expect(actions).toEqual([
      { chimpId: "c1", type: "set_topics", topics: [topic] },
    ]);
  });

  test("ensure-consumers (no deliverFrom) → create_consumers with timestamp", () => {
    const actions = interpret(
      decide({
        type: "orchestration_action",
        timestamp: T,
        action: { type: "ensure-consumers", chimpId: "new-chimp" },
      }),
      emptyHandler,
    );

    expect(actions).toEqual([
      {
        chimpId: "new-chimp",
        type: "create_consumers",
        eventFilterSubjects: ["events.direct.new-chimp.>"],
        deliverFrom: { type: "time", value: T },
      },
    ]);
  });

  test("ensure-consumers (with deliverFrom) → create_consumers passes through", () => {
    const actions = interpret(
      decide({
        type: "orchestration_action",
        timestamp: T,
        action: {
          type: "ensure-consumers",
          chimpId: "new-chimp",
          deliverFrom: { type: "sequence", value: 99 },
        },
      }),
      emptyHandler,
    );

    expect(actions).toEqual([
      {
        chimpId: "new-chimp",
        type: "create_consumers",
        eventFilterSubjects: ["events.direct.new-chimp.>"],
        deliverFrom: { type: "sequence", value: 99 },
      },
    ]);
  });

  test("ensure-job → queries profile, then create_job", () => {
    const actions = interpret(
      decide({
        type: "orchestration_action",
        timestamp: T,
        action: { type: "ensure-job", chimpId: "new-chimp" },
      }),
      emptyHandler,
    );

    expect(actions).toEqual([
      { chimpId: "new-chimp", type: "create_job", profile: P },
    ]);
  });

  test("delete-chimp → cleanup actions", () => {
    const actions = interpret(
      decide({
        type: "orchestration_action",
        timestamp: T,
        action: { type: "delete-chimp", chimpId: "c1" },
      }),
      emptyHandler,
    );

    expect(actions).toEqual([
      { chimpId: "c1", type: "delete_consumers" },
      { chimpId: "c1", type: "delete_job" },
      { chimpId: "c1", type: "delete_state" },
      { chimpId: "c1", type: "unregister_all_topics" },
    ]);
  });
});
