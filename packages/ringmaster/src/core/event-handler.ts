import { type Logger, Protocol, Standards } from "@mnke/circus-shared";
import { type TopicRegistry, Typing } from "@mnke/circus-shared/lib";
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
          action.startSequence,
        );
        break;

      case "register_topic":
        await this.deps.topicRegistry.subscribe(action.topic, action.chimpId, {
          force: action.force ?? false,
        });
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

      case "transfer_topics": {
        const topics = await this.deps.topicRegistry.listForChimp(
          action.fromChimpId,
        );
        const topicFilters = topics.map(Standards.Topic.topicToEventSubject);

        // Create consumer for new chimpId with topic filters before
        // updating KV — ensures consumer exists when subscribe() tries
        // to update filter_subjects
        await this.deps.consumerManager.ensureConsumer(
          action.toChimpId,
          topicFilters,
          1,
        );

        for (const topic of topics) {
          await this.deps.topicRegistry.subscribe(topic, action.toChimpId, {
            force: true,
          });
        }
        await this.deps.topicRegistry.unsubscribeAll(action.fromChimpId);
        await this.deps.consumerManager.deleteConsumer(action.fromChimpId);
        break;
      }

      case "handoff": {
        // Create consumer for new chimp with subscribed topic filters
        const topicFilters = action.subscriptions.map(
          Standards.Topic.topicToEventSubject,
        );
        if (topicFilters.length > 0) {
          await this.deps.consumerManager.ensureConsumer(
            action.toChimpId,
            topicFilters,
            1,
          );
        }

        // Update new chimp status and send resume command
        await this.deps.stateManager.upsert(
          action.toChimpId,
          action.targetProfile,
          "scheduled",
        );
        await this.deps.metaPublisher.publishStatus(
          action.targetProfile,
          action.toChimpId,
          "scheduled",
        );

        const resumeCommand: Protocol.ChimpCommand = {
          command: "resume-handoff",
          args: {
            fromProfile: action.fromProfile,
            reason: action.reason,
            summary: action.summary,
            subscriptions: action.subscriptions,
            eventContexts: action.eventContexts,
          },
        };
        const subject = Standards.Chimp.Naming.directSubject(action.toChimpId);
        this.deps.nc.publish(subject, JSON.stringify(resumeCommand));

        // Create job for new chimp
        await this.deps.jobManager.createJob(action.toChimpId, action.targetProfile);

        // Register topics for new chimp
        for (const topic of action.subscriptions) {
          await this.deps.topicRegistry.subscribe(topic, action.toChimpId, {
            force: true,
          });
        }

        break;
      }

      default:
        Typing.unreachable(action);
    }
  }
}
