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
      const state = { now: Date.now() };
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
        this.logger.info({ chimpId }, "Executing: create_job");
        await this.deps.jobManager.createJob(chimpId);
        break;

      case "create_consumer":
        this.logger.info(
          { chimpId, startSequence: action.startSequence },
          "Executing: create_consumer",
        );
        await this.deps.consumerManager.ensureConsumer(
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
          { chimpId, status: action.status },
          "Executing: upsert_state",
        );
        await this.deps.stateManager.upsert(chimpId, action.status);
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
