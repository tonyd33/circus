import { type Logger, Standards } from "@mnke/circus-shared";
import { type TopicRegistry, Typing } from "@mnke/circus-shared/lib";
import type {
  ConsumerManager,
  JobManager,
  MetaPublisher,
  StateManager,
} from "@/executors";
import { type Action, decide, deriveChimpId, type EventPayload } from "./core";

export interface EventHandlerDeps {
  jobManager: JobManager;
  consumerManager: ConsumerManager;
  stateManager: StateManager;
  metaPublisher: MetaPublisher;
  topicRegistry: TopicRegistry;
  getPod: (
    chimpId: string,
  ) => import("@kubernetes/client-node").V1Pod | undefined;
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
      let topicOwner = null;
      let chimpId: string;

      if (payload.type === "event_received") {
        if (payload.topic) {
          topicOwner = await this.deps.topicRegistry.lookup(payload.topic);
        }
        chimpId = topicOwner
          ? topicOwner.chimpId
          : deriveChimpId(payload.topic, payload.eventSubject);
      } else {
        chimpId = payload.chimpId;
      }

      const state = {
        now: Date.now(),
        pod: this.deps.getPod(chimpId),
        topicOwner,
      };
      const decision = decide(state, payload);
      chimpId = decision.chimpId;

      this.logger.info(
        { chimpId, reason: decision.reason },
        "Executing decision",
      );

      for (const action of decision.actions) {
        await this.executeAction(action, chimpId);
      }

      this.logger.info(
        { chimpId, actionCount: decision.actions.length },
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
    switch (action.type) {
      case "noop":
        break;

      case "create_job":
        this.logger.info(
          { chimpId, profile: action.profile },
          "Executing: create_job",
        );
        await this.deps.jobManager.createJob(chimpId, action.profile);
        break;

      case "create_consumers":
        this.logger.info(
          {
            chimpId,
            profile: action.profile,
            eventFilterSubjects: action.eventFilterSubjects,
            startSequence: action.startSequence,
          },
          "Executing: create_consumers",
        );
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
        this.logger.info(
          {
            chimpId,
            topic: Standards.Topic.serializeTopic(action.topic),
            profile: action.profile,
          },
          "Executing: register_topic",
        );
        await this.deps.topicRegistry.subscribe(
          action.topic,
          chimpId,
          action.profile,
          { force: action.force ?? false },
        );
        break;

      case "delete_consumers":
        this.logger.info({ chimpId }, "Executing: delete_consumers");
        await this.deps.consumerManager.deleteConsumers(chimpId);
        break;

      case "cleanup_topics":
        this.logger.info({ chimpId }, "Executing: cleanup_topics");
        await this.deps.topicRegistry.unsubscribeAll(chimpId);
        break;

      case "delete_job":
        this.logger.info({ chimpId }, "Executing: delete_job");
        await this.deps.jobManager.deleteJob(chimpId);
        break;

      case "upsert_state":
        this.logger.info(
          { chimpId, profile: action.profile, status: action.status },
          "Executing: upsert_state",
        );
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

      case "delete_state":
        this.logger.info({ chimpId }, "Executing: delete_state");
        await this.deps.stateManager.delete(chimpId);
        break;

      default:
        Typing.unreachable(action);
    }
  }
}
