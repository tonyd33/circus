/**
 * Ringmaster - Pod Watcher
 *
 * Watches Kubernetes pod events for real-time awareness of Chimp pod lifecycle
 */

import * as k8s from "@kubernetes/client-node";
import type Redis from "ioredis";
import { createLogger } from "@mnke/circus-shared/logger";
import {
  ChimpNaming,
  type ChimpHealth,
  type ChimpState,
  type RingmasterConfig,
} from "./types.ts";

const logger = createLogger("PodWatcher");

export class PodWatcher {
  private kc: k8s.KubeConfig;
  private watch: k8s.Watch;
  private redis: Redis;
  private namespace: string;
  private abortController: AbortController | null = null;
  private onPodFailed: (chimpName: string) => Promise<void>;

  constructor(
    config: RingmasterConfig,
    redis: Redis,
    onPodFailed: (chimpName: string) => Promise<void>,
  ) {
    this.kc = new k8s.KubeConfig();
    this.kc.loadFromDefault();
    this.watch = new k8s.Watch(this.kc);
    this.redis = redis;
    this.namespace = config.namespace;
    this.onPodFailed = onPodFailed;
  }

  /**
   * Start watching pod events
   */
  async start(): Promise<void> {
    this.abortController = new AbortController();

    const path = `/api/v1/namespaces/${this.namespace}/pods`;
    const queryParams = {
      labelSelector: "managed-by=ringmaster",
    };

    logger.info({ namespace: this.namespace }, "Starting to watch pods");

    // Start the watch
    const watchRequest = async () => {
      try {
        await this.watch.watch(
          path,
          queryParams,
          async (type: string, apiObj: any) => {
            await this.handlePodEvent(type, apiObj);
          },
          (error: any) => {
            if (error) {
              logger.error({ err: error }, "Watch error");
              // Reconnect after a delay
              if (!this.abortController?.signal.aborted) {
                logger.info("Reconnecting in 5s...");
                setTimeout(() => {
                  if (!this.abortController?.signal.aborted) {
                    watchRequest();
                  }
                }, 5000);
              }
            }
          },
        );
      } catch (error: any) {
        logger.error({ err: error }, "Failed to start watch");
        // Retry after delay
        if (!this.abortController?.signal.aborted) {
          logger.info("Retrying in 5s...");
          setTimeout(() => {
            if (!this.abortController?.signal.aborted) {
              watchRequest();
            }
          }, 5000);
        }
      }
    };

    // Start watching
    watchRequest();
  }

  /**
   * Handle a pod event
   */
  private async handlePodEvent(type: string, pod: k8s.V1Pod): Promise<void> {
    const podName = pod.metadata?.name;
    const chimpLabel = pod.metadata?.labels?.["chimp-name"];

    if (!podName || !chimpLabel) {
      return;
    }

    const chimpName = chimpLabel;
    const phase = pod.status?.phase || "Unknown";

    logger.info({ eventType: type, podName, phase }, "Pod event");

    try {
      switch (type) {
        case "ADDED":
          await this.handlePodAdded(chimpName, pod);
          break;

        case "MODIFIED":
          await this.handlePodModified(chimpName, pod);
          break;

        case "DELETED":
          await this.handlePodDeleted(chimpName, pod);
          break;

        default:
          logger.warn({ eventType: type }, "Unknown event type");
      }
    } catch (error) {
      logger.error(
        { eventType: type, chimpName, err: error },
        "Error handling pod event",
      );
    }
  }

  /**
   * Handle pod ADDED event
   */
  private async handlePodAdded(
    chimpName: string,
    pod: k8s.V1Pod,
  ): Promise<void> {
    const phase = pod.status?.phase || "Unknown";

    // Update Chimp state in Redis
    const chimpKey = ChimpNaming.redisChimpKey(chimpName);
    const state: ChimpState = {
      chimpName,
      podName: ChimpNaming.podName(chimpName),
      streamName: ChimpNaming.streamName(chimpName),
      createdAt: Date.now(),
      status: phase === "Running" ? "running" : "pending",
    };

    await this.redis.set(chimpKey, JSON.stringify(state));

    logger.info({ chimpName, phase }, "Pod added");

    // If already running, set initial health
    if (phase === "Running") {
      await this.setInitialHealth(chimpName);
    }
  }

  /**
   * Handle pod MODIFIED event
   */
  private async handlePodModified(
    chimpName: string,
    pod: k8s.V1Pod,
  ): Promise<void> {
    const phase = pod.status?.phase || "Unknown";
    const chimpKey = ChimpNaming.redisChimpKey(chimpName);

    // Get current state
    const stateData = await this.redis.get(chimpKey);
    if (!stateData) {
      // State doesn't exist, treat as new
      await this.handlePodAdded(chimpName, pod);
      return;
    }

    const state: ChimpState = JSON.parse(stateData);
    const oldStatus = state.status;

    // Update status based on phase
    if (phase === "Running") {
      state.status = "running";
      // Set initial health when transitioning to running
      if (oldStatus !== "running") {
        await this.setInitialHealth(chimpName);
        logger.info({ chimpName }, "Pod transitioned to Running");
      }
    } else if (phase === "Failed" || phase === "Unknown") {
      state.status = "failed";
      // Clear health
      await this.clearHealth(chimpName);
      logger.warn({ chimpName, phase }, "Pod failed, triggering recreation");
      // Trigger recreation
      await this.onPodFailed(chimpName);
    } else if (phase === "Pending") {
      state.status = "pending";
    }

    // Save updated state
    await this.redis.set(chimpKey, JSON.stringify(state));
  }

  /**
   * Handle pod DELETED event
   */
  private async handlePodDeleted(
    chimpName: string,
    pod: k8s.V1Pod,
  ): Promise<void> {
    logger.info({ chimpName }, "Pod deleted, clearing health");

    // Clear health
    await this.clearHealth(chimpName);

    // Update state to mark as failed (pod was deleted)
    const chimpKey = ChimpNaming.redisChimpKey(chimpName);
    const stateData = await this.redis.get(chimpKey);

    if (stateData) {
      const state: ChimpState = JSON.parse(stateData);
      state.status = "failed";
      await this.redis.set(chimpKey, JSON.stringify(state));
    }

    // Trigger recreation if this was unexpected
    logger.info({ chimpName }, "Triggering recreation for deleted pod");
    await this.onPodFailed(chimpName);
  }

  /**
   * Set initial health when pod starts running
   */
  private async setInitialHealth(chimpName: string): Promise<void> {
    const healthKey = ChimpNaming.redisHealthKey(chimpName);

    const health: ChimpHealth = {
      lastHeartbeat: Date.now(),
      messageCount: 0,
    };

    // Set health with 30s TTL
    await this.redis.setex(healthKey, 30, JSON.stringify(health));

    logger.info({ chimpName }, "Set initial health");
  }

  /**
   * Clear health when pod fails or is deleted
   */
  private async clearHealth(chimpName: string): Promise<void> {
    const healthKey = ChimpNaming.redisHealthKey(chimpName);
    await this.redis.del(healthKey);
  }

  /**
   * Stop watching pod events
   */
  async stop(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    logger.info("Stopped");
  }
}
