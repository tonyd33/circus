/**
 * Ringmaster - Pod Manager
 *
 * Manages Kubernetes pod lifecycle for Chimps
 */

import * as k8s from "@kubernetes/client-node";
import { ChimpNaming } from "@mnke/circus-shared/chimp-naming";
import { createLogger } from "@mnke/circus-shared/logger";
import type { RingmasterConfig } from "../core/types.ts";
import { isK8sConflict, isK8sNotFound } from "../utils/k8s-errors.ts";

const logger = createLogger("PodManager");

export class PodManager {
  private k8sApi: k8s.CoreV1Api;
  private namespace: string;
  private chimpImage: string;
  private anthropicApiKey: string;
  private chimpInitConfigMap?: string;

  constructor(config: RingmasterConfig) {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();

    this.k8sApi = kc.makeApiClient(k8s.CoreV1Api);
    this.namespace = config.namespace;
    this.chimpImage = config.chimpImage;
    this.anthropicApiKey = config.anthropicApiKey;
    this.chimpInitConfigMap = process.env.CHIMP_INIT_CONFIG_MAP;
  }

  /**
   * Create a Chimp pod (idempotent)
   */
  async createPod(chimpName: string): Promise<void> {
    const podName = ChimpNaming.podName(chimpName);

    // Check if pod already exists
    try {
      await this.k8sApi.readNamespacedPod({
        name: podName,
        namespace: this.namespace,
      });
      logger.debug({ podName }, "Pod already exists, skipping creation");
      return;
    } catch (error) {
      if (!isK8sNotFound(error)) {
        throw error;
      }
      // Pod doesn't exist, proceed with creation
    }

    const pod: k8s.V1Pod = {
      apiVersion: "v1",
      kind: "Pod",
      metadata: {
        name: podName,
        namespace: this.namespace,
        labels: {
          app: "chimp",
          "mnke.circus.chimp-name": chimpName,
          "managed-by": "ringmaster",
        },
      },
      spec: {
        containers: [
          {
            name: "circus-chimp",
            image: this.chimpImage,
            imagePullPolicy: "Never", // For local development
            env: [
              {
                name: "CHIMP_NAME",
                value: chimpName,
              },
              {
                name: "ANTHROPIC_API_KEY",
                value: this.anthropicApiKey,
              },
              {
                name: "NATS_URL",
                value: process.env.NATS_URL || "nats://nats:4222",
              },
              {
                name: "REDIS_URL",
                value: process.env.REDIS_URL || "redis://redis:6379",
              },
            ],
            volumeMounts: this.chimpInitConfigMap
              ? [
                  {
                    name: "chimp-init-config",
                    mountPath: "/etc/chimp",
                    readOnly: true,
                  },
                ]
              : [],
          },
        ],
        volumes: this.chimpInitConfigMap
          ? [
              {
                name: "chimp-init-config",
                configMap: {
                  name: this.chimpInitConfigMap,
                  optional: true, // Don't fail if ConfigMap doesn't exist
                },
              },
            ]
          : [],
        restartPolicy: "Never", // Chimps are ephemeral - don't restart on exit
      },
    };

    try {
      await this.k8sApi.createNamespacedPod({
        namespace: this.namespace,
        body: pod,
      });
      logger.info({ podName, chimpName }, "Created pod");
    } catch (error) {
      // Handle race condition - another ringmaster may have created it
      if (isK8sConflict(error)) {
        logger.debug(
          { podName },
          "Pod already exists (race condition), continuing",
        );
        return;
      }
      throw error;
    }
  }

  /**
   * Check if a pod exists and is running
   */
  async isPodRunning(chimpName: string): Promise<boolean> {
    const podName = ChimpNaming.podName(chimpName);

    try {
      const pod = await this.k8sApi.readNamespacedPod({
        name: podName,
        namespace: this.namespace,
      });

      return pod.status?.phase === "Running";
    } catch (error) {
      if (isK8sNotFound(error)) {
        return false;
      }
      throw error;
    }
  }

  /**
   * Delete a Chimp pod
   */
  async deletePod(chimpName: string): Promise<void> {
    const podName = ChimpNaming.podName(chimpName);

    try {
      await this.k8sApi.deleteNamespacedPod({
        name: podName,
        namespace: this.namespace,
      });
      logger.info({ podName, chimpName }, "Deleted pod");
    } catch (error) {
      if (isK8sNotFound(error)) {
        logger.debug({ podName }, "Pod doesn't exist, skipping deletion");
        return;
      }
      throw error;
    }
  }
}
