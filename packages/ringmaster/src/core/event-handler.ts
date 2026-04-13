/**
 * Ringmaster - Event Handler
 *
 * Main event handling logic that bridges events to core decision-making
 */

import { Typing } from "@mnke/circus-shared/lib";
import { createLogger } from "@mnke/circus-shared/logger";
import { type Action, decide, type EventPayload } from "../core/core.ts";
import type { ConsumerManager } from "../managers/consumer-manager.ts";
import type { JobManager } from "../managers/job-manager.ts";
import type { RedisManager } from "../managers/redis-manager.ts";

const logger = createLogger("EventHandler");

/**
 * Dependencies needed by the event handler
 */
export interface EventHandlerDeps {
  jobManager: JobManager;
  consumerManager: ConsumerManager;
  redisManager: RedisManager;
}

/**
 * Event handler type - takes a chimp ID and event payload, executes logic
 */
export type RingmasterEventHandler = (
  chimpId: string,
  payload: EventPayload,
) => Promise<void>;

/**
 * Execute a single action
 */
async function executeAction(
  action: Action,
  chimpId: string,
  deps: EventHandlerDeps,
): Promise<void> {
  switch (action.type) {
    case "noop":
      break;

    case "create_job":
      logger.info({ chimpId }, "Executing: create_job");
      await deps.jobManager.createJob(chimpId);
      break;

    case "create_consumer":
      logger.info(
        { chimpId, startSequence: action.startSequence },
        "Executing: create_consumer",
      );
      await deps.consumerManager.ensureConsumer(chimpId, action.startSequence);
      break;

    case "delete_consumer":
      logger.info({ chimpId }, "Executing: delete_consumer");
      await deps.consumerManager.deleteConsumer(chimpId);
      break;

    case "upsert_state":
      logger.info(
        { chimpId, status: action.status },
        "Executing: upsert_state",
      );
      await deps.redisManager.upsert(chimpId, action.status);
      break;

    case "delete_state":
      logger.info({ chimpId }, "Executing: delete_state");
      await deps.redisManager.delete(chimpId);
      break;

    default:
      Typing.unreachable(action);
  }
}

/**
 * Create an event handler with the given dependencies
 */
export function createEventHandler(
  deps: EventHandlerDeps,
): RingmasterEventHandler {
  return async (chimpId: string, payload: EventPayload): Promise<void> => {
    try {
      // Gather core state (just timestamp)
      const state = { now: Date.now() };

      // Make decision (pure logic)
      const decision = decide(state, payload);

      logger.info({ chimpId, reason: decision.reason }, "Executing decision");

      // Execute actions
      for (const action of decision.actions) {
        await executeAction(action, chimpId, deps);
      }

      logger.info(
        { chimpId, actionCount: decision.actions.length },
        "Decision executed",
      );
    } catch (error) {
      logger.error(
        { err: error, chimpId, payloadType: payload.type },
        "Error handling event",
      );
      throw error;
    }
  };
}
