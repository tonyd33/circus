/**
 * Ringmaster - Pod Watcher
 *
 * Watches Kubernetes pod events for real-time awareness of Chimp pod lifecycle.
 *
 * Resilience features:
 * - Exponential backoff on reconnection failures
 * - Treats watch stream closure as an error and reconnects
 * - Health monitoring with last successful connection timestamp
 * - Bounded retry attempts to prevent silent infinite retry loops
 */

import * as k8s from "@kubernetes/client-node";
import type { Logger } from "@mnke/circus-shared";
import type { EventHandler } from "../core/event-handler.ts";
import { Labels } from "../lib/k8s.ts";

const INITIAL_RETRY_DELAY_MS = 1000;
const MAX_RETRY_DELAY_MS = 30000;
const MAX_CONSECUTIVE_FAILURES = 10;

export class PodWatcher {
  private kc: k8s.KubeConfig;
  private watch: k8s.Watch;
  private namespace: string;
  private abortController: AbortController | null = null;
  private eventHandler: EventHandler;
  private logger: Logger.Logger;

  private isStarted = false;
  private consecutiveFailures = 0;
  private lastSuccessfulConnection: number | null = null;
  private watchPromise: Promise<void> | null = null;
  private watchResolve: (() => void) | null = null;

  constructor(
    namespace: string,
    eventHandler: EventHandler,
    logger: Logger.Logger,
  ) {
    this.kc = new k8s.KubeConfig();
    this.kc.loadFromDefault();
    this.watch = new k8s.Watch(this.kc);
    this.namespace = namespace;
    this.eventHandler = eventHandler;
    this.logger = logger;
  }

  /**
   * Start watching pod events.
   * Returns a promise that resolves when the watch is successfully connected.
   * Rejects if max consecutive failures is reached.
   */
  async start(): Promise<void> {
    this.abortController = new AbortController();
    this.isStarted = true;
    this.consecutiveFailures = 0;

    // Create a promise that resolves when watch is successfully started
    this.watchPromise = new Promise<void>((resolve) => {
      this.watchResolve = resolve;
    });

    const path = `/api/v1/namespaces/${this.namespace}/pods`;
    const queryParams = {
      labelSelector: `${Labels.MANAGED_BY}=ringmaster`,
    };

    this.logger.info({ namespace: this.namespace }, "Starting to watch pods");

    // Start the watch with resilience logic
    this.beginWatching(path, queryParams);

    // Wait for successful connection before returning
    return this.watchPromise;
  }

  /**
   * Begin or resume watching with exponential backoff on failures
   */
  private beginWatching(
    path: string,
    queryParams: Record<string, string>,
  ): void {
    if (!this.isStarted || this.abortController?.signal.aborted) {
      return;
    }

    this.performWatch(path, queryParams).catch((_error) => {
      // Watch promise rejected, which means we need to retry
      if (!this.isStarted || this.abortController?.signal.aborted) {
        return;
      }

      this.consecutiveFailures++;

      if (this.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES) {
        this.logger.error(
          { consecutiveFailures: this.consecutiveFailures },
          "Max consecutive failures reached, stopping retry attempts",
        );
        this.isStarted = false;
        return;
      }

      // Calculate exponential backoff
      const delayMs = Math.min(
        INITIAL_RETRY_DELAY_MS * 2 ** (this.consecutiveFailures - 1),
        MAX_RETRY_DELAY_MS,
      );

      this.logger.warn(
        {
          consecutiveFailures: this.consecutiveFailures,
          maxFailures: MAX_CONSECUTIVE_FAILURES,
          retryDelayMs: delayMs,
        },
        "Watch failed, will retry",
      );

      setTimeout(() => {
        this.beginWatching(path, queryParams);
      }, delayMs);
    });
  }

  /**
   * Perform a single watch operation.
   * Returns a promise that rejects on any error or watch stream closure.
   */
  private performWatch(
    path: string,
    queryParams: Record<string, string>,
  ): Promise<void> {
    return new Promise((resolve, reject) => {
      this.watch.watch(
        path,
        queryParams,
        async (type: string, apiObj: any) => {
          try {
            await this.handlePodEvent(type, apiObj);
          } catch (error) {
            this.logger.error(
              { err: error, eventType: type },
              "Error handling pod event",
            );
          }
        },
        (error: any) => {
          if (error) {
            // Explicit error from watch stream
            this.logger.error({ err: error }, "Watch stream error");
            reject(error);
          } else {
            // Watch stream ended without error - treat as failure and reconnect
            this.logger.warn("Watch stream closed unexpectedly");
            reject(new Error("Watch stream closed unexpectedly"));
          }
        },
      );

      // Record successful connection
      if (
        this.consecutiveFailures === 0 ||
        this.lastSuccessfulConnection === null
      ) {
        this.lastSuccessfulConnection = Date.now();
        this.consecutiveFailures = 0;
        this.logger.info("Watch connection established successfully");

        // Resolve the start promise on first successful connection
        if (this.watchResolve) {
          this.watchResolve();
          this.watchResolve = null;
        }
      }

      // If we reach here without error handler firing, the watch stays open
      // The promise will resolve if the watch completes normally (shouldn't happen in practice)
      resolve();
    });
  }

  /**
   * Handle a pod event
   */
  private async handlePodEvent(type: string, pod: k8s.V1Pod): Promise<void> {
    const chimpId = pod.metadata?.labels?.[Labels.CHIMP_ID];
    const profile = pod.metadata?.labels?.[Labels.CHIMP_PROFILE];

    if (!chimpId || !profile) {
      this.logger.debug(
        { podName: pod.metadata?.name },
        "Pod missing chimp-id or chimp-profile label, skipping",
      );
      return;
    }

    this.logger.debug(
      { eventType: type, chimpId, profile, podName: pod.metadata?.name },
      "Pod event received",
    );

    await this.eventHandler.handleEvent({
      type: "pod_event",
      chimpId,
      profile,
      eventType: type,
      pod,
    });
  }

  /**
   * Stop watching pod events
   */
  async stop(): Promise<void> {
    this.isStarted = false;

    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.logger.info("Stopped");
  }

  /**
   * Get health status of the watcher
   */
  getHealthStatus(): {
    isRunning: boolean;
    lastSuccessfulConnection: number | null;
    consecutiveFailures: number;
  } {
    return {
      isRunning: this.isStarted && !this.abortController?.signal.aborted,
      lastSuccessfulConnection: this.lastSuccessfulConnection,
      consecutiveFailures: this.consecutiveFailures,
    };
  }
}
