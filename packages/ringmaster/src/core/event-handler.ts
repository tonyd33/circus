import { Standards } from "@mnke/circus-shared";
import type {
  ChimpProfileStore,
  TopicRegistry,
} from "@mnke/circus-shared/components";
import { Typing } from "@mnke/circus-shared/lib";
import type * as Logger from "@mnke/circus-shared/logger";
import type { NatsConnection } from "nats";
import type {
  ConsumerManager,
  JobManager,
  MetaPublisher,
  StateManager,
} from "@/executors";
import type { PodCache } from "@/state";
import {
  type Action,
  decide,
  type Effect,
  type EventPayload,
  type Query,
  type QueryResultMap,
} from "./core";

export interface EventHandlerDeps {
  nc: NatsConnection;
  jobManager: JobManager;
  consumerManager: ConsumerManager;
  stateManager: StateManager;
  metaPublisher: MetaPublisher;
  topicRegistry: TopicRegistry;
  chimpProfileStore: ChimpProfileStore;
  podCache: PodCache;
  logger: Logger.Logger;
}

export class EventHandler {
  private logger: Logger.Logger;
  private deps: EventHandlerDeps;

  constructor(deps: EventHandlerDeps) {
    this.deps = deps;
    this.logger = deps.logger;
  }

  async handleEvent(payload: EventPayload): Promise<void> {
    try {
      const effect = decide(payload);
      await this.interpret(effect);
    } catch (error) {
      this.logger.error(
        { err: error, payloadType: payload.type },
        "Error handling event",
      );
      throw error;
    }
  }

  private async interpret(effect: Effect): Promise<void> {
    switch (effect.type) {
      case "pure":
        for (const action of effect.actions) {
          await this.executeAction(action);
        }
        break;
      case "query": {
        const result = await this.runQuery(effect.query);
        // biome-ignore lint/suspicious/noExplicitAny: effect cont boundary erases query result type
        const next = (effect.cont as (r: any) => Effect)(result);
        await this.interpret(next);
        break;
      }
    }
  }

  private async runQuery(query: Query): Promise<QueryResultMap[Query["type"]]> {
    switch (query.type) {
      case "lookup_topic":
        return this.deps.topicRegistry.lookup(query.topic);
      case "get_pod":
        return this.deps.podCache.getPod(query.chimpId);
      case "get_chimp_state":
        return this.deps.stateManager.get(query.chimpId);
      case "get_chimp_profile":
        return this.deps.chimpProfileStore.getProfile(query.chimpId);
    }
  }

  private async executeAction(action: Action): Promise<void> {
    this.logger.info({ action }, "Executing action");
    switch (action.type) {
      case "create_job":
        await this.deps.jobManager.createJob(action.chimpId, action.profile);
        break;

      case "create_consumers":
        await this.deps.consumerManager.ensureConsumer(
          action.chimpId,
          action.eventFilterSubjects,
          action.deliverFrom,
        );
        break;

      case "register_topic":
        await this.deps.topicRegistry.subscribe(action.topic, action.chimpId);
        break;

      case "delete_consumers":
        await this.deps.consumerManager.deleteConsumer(action.chimpId);
        break;

      case "delete_job":
        await this.deps.jobManager.deleteJob(action.chimpId);
        break;

      case "upsert_status":
        await this.deps.stateManager.upsert(action.chimpId, action.status);
        await this.deps.metaPublisher.publishStatus(
          action.chimpId,
          action.status,
        );
        break;

      case "set_profile":
        await this.deps.metaPublisher.publishProfile(
          action.chimpId,
          action.profile,
        );
        break;

      case "set_topics":
        await this.deps.metaPublisher.publishTopics(
          action.chimpId,
          action.topics,
        );
        break;

      case "delete_state":
        await this.deps.stateManager.delete(action.chimpId);
        break;

      case "send_command": {
        const subject = Standards.Chimp.Naming.directSubject(action.chimpId);
        this.deps.nc.publish(subject, JSON.stringify(action.command));
        break;
      }

      default:
        Typing.unreachable(action);
    }
  }
}
