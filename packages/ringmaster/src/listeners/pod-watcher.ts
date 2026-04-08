/**
 * Ringmaster - Pod Watcher
 *
 * Watches Kubernetes pod events for real-time awareness of Chimp pod lifecycle
 */

import * as k8s from "@kubernetes/client-node";
import { createLogger } from "@mnke/circus-shared/logger";
import type Redis from "ioredis";
import { type ExecutorDeps, handleEvent } from "../adapters/core-adapter.ts";
import type {
  ChimpHealth,
  ChimpState,
  RingmasterConfig,
} from "../core/types.ts";
import type { PodManager } from "../managers/pod-manager.ts";
import type { StreamManager } from "../managers/stream-manager.ts";

const logger = createLogger("PodWatcher");

export class PodWatcher {
  private kc: k8s.KubeConfig;
  private watch: k8s.Watch;
  private redis: Redis;
  private namespace: string;
  private abortController: AbortController | null = null;
  private podManager: PodManager;
  private streamManager: StreamManager;

  constructor(
    config: RingmasterConfig,
    redis: Redis,
    podManager: PodManager,
    streamManager: StreamManager,
  ) {
    this.kc = new k8s.KubeConfig();
    this.kc.loadFromDefault();
    this.watch = new k8s.Watch(this.kc);
    this.redis = redis;
    this.namespace = config.namespace;
    this.podManager = podManager;
    this.streamManager = streamManager;
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
    logger.info({ chimpName, phase }, "Pod added");

    // Delegate to core layer
    await handleEvent(
      chimpName,
      { type: "pod_event", event: "added", pod },
      {
        redis: this.redis,
        podManager: this.podManager,
        streamManager: this.streamManager,
      },
    );
  }

  /**
   * Handle pod MODIFIED event
   */
  private async handlePodModified(
    chimpName: string,
    pod: k8s.V1Pod,
  ): Promise<void> {
    const phase = pod.status?.phase || "Unknown";
    logger.info({ chimpName, phase }, "Pod modified");

    // Delegate to core layer
    await handleEvent(
      chimpName,
      { type: "pod_event", event: "modified", pod },
      {
        redis: this.redis,
        podManager: this.podManager,
        streamManager: this.streamManager,
      },
    );
  }

  /**
   * Handle pod DELETED event
   */
  private async handlePodDeleted(
    chimpName: string,
    pod: k8s.V1Pod,
  ): Promise<void> {
    logger.info({ chimpName }, "Pod deleted");

    // Delegate to core layer
    await handleEvent(
      chimpName,
      { type: "pod_event", event: "deleted", pod },
      {
        redis: this.redis,
        podManager: this.podManager,
        streamManager: this.streamManager,
      },
    );
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
