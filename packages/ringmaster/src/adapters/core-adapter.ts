/**
 * Ringmaster - Core Adapter
 *
 * Bridges the pure core logic with the effectful I/O layer.
 * This module handles:
 * 1. Gathering state snapshots from Redis/K8s
 * 2. Executing actions returned by the core logic
 */

import type * as k8s from "@kubernetes/client-node";
import { ChimpNaming } from "@mnke/circus-shared/chimp-naming";
import { createLogger } from "@mnke/circus-shared/logger";
import type Redis from "ioredis";
import {
  type Action,
  type ChimpActivity,
  type CoreState,
  DEFAULT_HEALTH_CONFIG,
  type Decision,
  decide,
  type EventPayload,
  type HealthConfig,
} from "../core/core.ts";
import type { ChimpHealth, ChimpState } from "../core/types.ts";
import type { PodManager } from "../managers/pod-manager.ts";
import type { StreamManager } from "../managers/stream-manager.ts";

const logger = createLogger("CoreAdapter");

/**
 * Dependencies needed to execute actions
 */
export interface ExecutorDeps {
  redis: Redis;
  podManager: PodManager;
  streamManager: StreamManager;
}

/**
 * Gather core state for a chimp from Redis and K8s
 */
export async function gatherCoreState(
  chimpName: string,
  redis: Redis,
): Promise<CoreState> {
  const now = Date.now();

  // Get ChimpState
  const chimpKey = ChimpNaming.redisChimpKey(chimpName);
  const chimpStateData = await redis.get(chimpKey);
  const chimpState: ChimpState | null = chimpStateData
    ? JSON.parse(chimpStateData)
    : null;

  // Check if session exists
  const sessionKey = ChimpNaming.redisSessionKey(chimpName);
  const sessionExists = (await redis.exists(sessionKey)) === 1;

  // Get health data
  const healthKey = ChimpNaming.redisHealthKey(chimpName);
  const healthData = await redis.get(healthKey);
  const health: ChimpHealth | null = healthData ? JSON.parse(healthData) : null;

  // Get activity data
  const activityKey = ChimpNaming.redisActivityKey(chimpName);
  const activityData = await redis.get(activityKey);
  const activity: ChimpActivity | null = activityData
    ? JSON.parse(activityData)
    : null;

  return {
    chimpState,
    sessionExists,
    health,
    activity,
    now,
  };
}

/**
 * Execute a single action
 */
async function executeAction(
  action: Action,
  chimpName: string,
  deps: ExecutorDeps,
): Promise<void> {
  switch (action.type) {
    case "noop":
      // Do nothing
      break;

    case "create_pod":
      logger.info({ chimpName }, "Executing: create_pod");
      await deps.podManager.createPod(chimpName);
      break;

    case "delete_pod":
      logger.info({ chimpName }, "Executing: delete_pod");
      await deps.podManager.deletePod(chimpName);
      break;

    case "create_stream":
      logger.info({ chimpName }, "Executing: create_stream");
      await deps.streamManager.createStream(chimpName);
      await deps.streamManager.createConsumer(chimpName);
      break;

    case "delete_stream":
      logger.info({ chimpName }, "Executing: delete_stream");
      // Note: We don't currently have a delete stream method
      // This is intentional - streams are kept for message history
      logger.warn(
        { chimpName },
        "delete_stream requested but not implemented (streams are persistent)",
      );
      break;

    case "delete_session": {
      logger.info({ chimpName }, "Executing: delete_session");
      const sessionKey = ChimpNaming.redisSessionKey(chimpName);
      await deps.redis.del(sessionKey);
      break;
    }

    case "delete_health": {
      logger.info({ chimpName }, "Executing: delete_health");
      const healthKey = ChimpNaming.redisHealthKey(chimpName);
      await deps.redis.del(healthKey);
      break;
    }

    case "update_chimp_state": {
      logger.info(
        { chimpName, status: action.status },
        "Executing: update_chimp_state",
      );
      const chimpKey = ChimpNaming.redisChimpKey(chimpName);
      const stateData = await deps.redis.get(chimpKey);

      if (stateData) {
        const state: ChimpState = JSON.parse(stateData);
        state.status = action.status;
        await deps.redis.set(chimpKey, JSON.stringify(state));
      } else {
        // Create new state
        const state: ChimpState = {
          chimpName,
          podName: ChimpNaming.podName(chimpName),
          streamName: ChimpNaming.streamName(chimpName),
          createdAt: Date.now(),
          status: action.status,
        };
        await deps.redis.set(chimpKey, JSON.stringify(state));
      }
      break;
    }
  }
}

/**
 * Execute all actions from a decision
 */
export async function executeDecision(
  decision: Decision,
  chimpName: string,
  deps: ExecutorDeps,
): Promise<void> {
  logger.info({ chimpName, reason: decision.reason }, "Executing decision");

  for (const action of decision.actions) {
    await executeAction(action, chimpName, deps);
  }

  logger.info(
    { chimpName, actionCount: decision.actions.length },
    "Decision executed",
  );
}

/**
 * Main entry point: gather state, make decision, execute
 */
export async function handleEvent(
  chimpName: string,
  payload: EventPayload,
  deps: ExecutorDeps,
  config: HealthConfig = DEFAULT_HEALTH_CONFIG,
): Promise<Decision> {
  // Gather core state
  const state = await gatherCoreState(chimpName, deps.redis);

  // Make decision (pure logic)
  const decision = decide(state, payload, config);

  // Execute decision
  await executeDecision(decision, chimpName, deps);

  return decision;
}
