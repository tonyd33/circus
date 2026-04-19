/**
 * Ringmaster - Event Handler
 *
 * Main event handling logic that bridges events to core decision-making
 */

import type { Logger } from "@mnke/circus-shared";
import { Typing } from "@mnke/circus-shared/lib";
import type {
  ConsumerManager,
  JobManager,
  MetaPublisher,
  StateManager,
} from "@/executors";
import { type Action, decide, type EventPayload } from "./core";

export interface EventHandlerDeps {
  jobManager: JobManager;
  consumerManager: ConsumerManager;
  stateManager: StateManager;
  metaPublisher: MetaPublisher;
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

  async handle(chimpId: string, payload: EventPayload): Promise<void> {
    try {
      const state = { now: Date.now(), pod: this.deps.getPod(chimpId) };
      const decision = decide(state, payload);

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
        { err: error, chimpId, payloadType: payload.type },
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

      case "create_consumer":
        this.logger.info(
          {
            chimpId,
            profile: action.profile,
            startSequence: action.startSequence,
          },
          "Executing: create_consumer",
        );
        await this.deps.consumerManager.ensureConsumer(
          action.profile,
          chimpId,
          action.startSequence,
        );
        break;

      case "delete_consumer":
        this.logger.info({ chimpId }, "Executing: delete_consumer");
        await this.deps.consumerManager.deleteConsumer(chimpId);
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
