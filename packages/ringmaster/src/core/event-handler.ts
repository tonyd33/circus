import { type Logger, Standards } from "@mnke/circus-shared";
import { Typing } from "@mnke/circus-shared/lib";
import type { TopicRegistry } from "@mnke/circus-shared/services";
import type { NatsConnection } from "nats";
import type {
  ConsumerManager,
  JobManager,
  MetaPublisher,
  StateManager,
} from "@/executors";
import type { PodCache } from "@/state";
import { type Action, decide, type EventPayload } from "./core";

export interface EventHandlerDeps {
  nc: NatsConnection;
  jobManager: JobManager;
  consumerManager: ConsumerManager;
  stateManager: StateManager;
  metaPublisher: MetaPublisher;
  topicRegistry: TopicRegistry;
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
      const state = {
        now: Date.now(),
        pod: this.deps.podCache.getPod(payload.chimpId),
      };
      const decision = decide(state, payload);

      this.logger.info(
        { chimpId: decision.chimpId, reason: decision.reason },
        "Executing decision",
      );

      for (const action of decision.actions) {
        await this.executeAction(action);
      }

      this.logger.info(
        { chimpId: decision.chimpId, actionCount: decision.actions.length },
        "Decision executed",
      );
    } catch (error) {
      this.logger.error(
        { err: error, payloadType: payload.type },
        "Error handling event",
      );
      throw error;
    }
  }

  private async executeAction(action: Action): Promise<void> {
    this.logger.info({ action }, "Executing action");
    switch (action.type) {
      case "noop":
        break;

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

      case "cleanup_topics":
        await this.deps.topicRegistry.unsubscribeAll(action.chimpId);
        break;

      case "delete_job":
        await this.deps.jobManager.deleteJob(action.chimpId);
        break;

      case "upsert_status":
        await this.deps.stateManager.upsert(
          action.chimpId,
          action.profile,
          action.status,
        );
        await this.deps.metaPublisher.publishStatus(
          action.profile,
          action.chimpId,
          action.status,
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
