/**
 * Ringmaster - Pod Watcher
 *
 * Watches Kubernetes pod events for real-time awareness of Chimp pod lifecycle
 */

import * as k8s from "@kubernetes/client-node";
import type { Logger } from "@mnke/circus-shared";
import type { EventHandler } from "../core/event-handler.ts";
import { Labels } from "../lib/k8s.ts";

export class PodWatcher {
  private kc: k8s.KubeConfig;
  private watch: k8s.Watch;
  private namespace: string;
  private abortController: AbortController | null = null;
  private eventHandler: EventHandler;
  private logger: Logger.Logger;

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
   * Start watching pod events
   */
  async start(): Promise<void> {
    this.abortController = new AbortController();

    const path = `/api/v1/namespaces/${this.namespace}/pods`;
    const queryParams = {
      labelSelector: `${Labels.MANAGED_BY}=ringmaster`,
    };

    this.logger.info({ namespace: this.namespace }, "Starting to watch pods");

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
              this.logger.error({ err: error }, "Watch error");
              // Reconnect after a delay
              if (!this.abortController?.signal.aborted) {
                this.logger.info("Reconnecting in 5s...");
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
        this.logger.error({ err: error }, "Failed to start watch");
        // Retry after delay
        if (!this.abortController?.signal.aborted) {
          this.logger.info("Retrying in 5s...");
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
    const chimpId = pod.metadata?.labels?.[Labels.CHIMP_ID];

    if (!chimpId) {
      this.logger.warn(
        { podName: pod.metadata?.name },
        "Pod missing chimp-id label, skipping",
      );
      return;
    }

    this.logger.info({ eventType: type, chimpId }, "Pod event");

    try {
      await this.eventHandler.handleEvent({
        type: "pod_event",
        chimpId,
        eventType: type,
        pod,
      });
    } catch (error) {
      this.logger.error(
        { eventType: type, chimpId, err: error },
        "Error handling pod event",
      );
    }
  }

  /**
   * Stop watching pod events
   */
  async stop(): Promise<void> {
    if (this.abortController) {
      this.abortController.abort();
      this.abortController = null;
    }

    this.logger.info("Stopped");
  }
}
