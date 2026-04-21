import { type Logger, Standards } from "@mnke/circus-shared";
import { type TopicRegistry, Typing } from "@mnke/circus-shared/lib";
import type {
  ConsumerManager,
  JobManager,
  MetaPublisher,
  StateManager,
} from "@/executors";
import type { PodCache } from "@/state";
import { type Action, decide, type EventPayload } from "./core";

export interface EventHandlerDeps {
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
        await this.executeAction(action, decision.chimpId);
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

  private async executeAction(action: Action, chimpId: string): Promise<void> {
    this.logger.info({ action, chimpId }, "Executing action");
    switch (action.type) {
      case "noop":
        break;

      case "create_job":
        await this.deps.jobManager.createJob(chimpId, action.profile);
        break;

      case "create_consumers":
        await this.deps.consumerManager.ensureEventConsumer(
          chimpId,
          action.eventFilterSubjects,
          action.startSequence,
        );
        await this.deps.consumerManager.ensureCommandConsumer(
          chimpId,
          action.startSequence,
        );
        break;

      case "register_topic":
        await this.deps.topicRegistry.subscribe(action.topic, chimpId, {
          force: action.force ?? false,
        });
        break;

      case "delete_consumers":
        await this.deps.consumerManager.deleteConsumers(chimpId);
        break;

      case "cleanup_topics":
        await this.deps.topicRegistry.unsubscribeAll(chimpId);
        break;

      case "delete_job":
        await this.deps.jobManager.deleteJob(chimpId);
        break;

      case "upsert_state":
        await this.deps.stateManager.upsert(
          chimpId,
          action.profile,
          action.status,
        );
        await this.deps.metaPublisher.publishStatus(
          action.profile,
          chimpId,
          action.status,
        );
        break;

      case "upsert_status": {
        await this.deps.stateManager.upsert(
          chimpId,
          action.profile,
          action.status,
        );
        await this.deps.metaPublisher.publishStatus(
          action.profile,
          chimpId,
          action.status,
        );
        break;
      }

      case "delete_state":
        await this.deps.stateManager.delete(chimpId);
        break;

      default:
        Typing.unreachable(action);
    }
  }
}
