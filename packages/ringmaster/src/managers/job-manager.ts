/**
 * Ringmaster - Job Manager
 *
 * Manages Kubernetes job lifecycle for Chimps
 */

import * as k8s from "@kubernetes/client-node";
import { Standards } from "@mnke/circus-shared";
import { createLogger } from "@mnke/circus-shared/logger";
import type { RingmasterConfig } from "../core/types.ts";
import type { ChimpJobConfig } from "../lib/chimp-job-config.ts";
import { namespaceLabel } from "../lib/k8s.ts";
import { isK8sConflict } from "../utils/k8s-errors.ts";

const logger = createLogger("JobManager");

export class JobManager {
  private k8sBatchApi: k8s.BatchV1Api;
  private namespace: string;
  private chimpImage: string;
  private natsUrl: string;
  private chimpBrainType: string;
  private chimpJobConfig: ChimpJobConfig;

  constructor(config: RingmasterConfig) {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();

    this.k8sBatchApi = kc.makeApiClient(k8s.BatchV1Api);
    this.namespace = config.namespace;
    this.chimpImage = config.chimpImage;
    this.natsUrl = config.natsUrl;
    this.chimpBrainType = config.chimpBrainType;
    this.chimpJobConfig = config.chimpJobConfig;
  }

  /**
   * Create a Chimp job (idempotent)
   */
  async createJob(chimpId: string): Promise<void> {
    const jobName = Standards.Chimp.Naming.podName(chimpId);

    const job: k8s.V1Job = {
      apiVersion: "batch/v1",
      kind: "Job",
      metadata: {
        name: jobName,
        namespace: this.namespace,
        labels: {
          app: "chimp",
          [namespaceLabel("chimp-id")]: chimpId,
          [namespaceLabel("managed-by")]: "ringmaster",
        },
      },
      spec: {
        template: {
          metadata: {
            labels: {
              app: "chimp",
              [namespaceLabel("chimp-id")]: chimpId,
              [namespaceLabel("managed-by")]: "ringmaster",
            },
          },
          spec: {
            containers: [
              {
                name: "chimp",
                image: this.chimpImage,
                imagePullPolicy: this.chimpJobConfig.imagePullPolicy ?? "Never",
                env: [
                  {
                    name: Standards.Chimp.Env.chimpId,
                    value: chimpId,
                  },
                  {
                    name: Standards.Chimp.Env.natsUrl,
                    value: this.natsUrl,
                  },
                  {
                    name: Standards.Chimp.Env.brainType,
                    value: this.chimpBrainType,
                  },
                  ...this.chimpJobConfig.extraEnv,
                ],
                ...(this.chimpJobConfig.volumeMounts.length > 0 && {
                  volumeMounts: this.chimpJobConfig.volumeMounts,
                }),
              },
            ],
            ...(this.chimpJobConfig.volumes.length > 0 && {
              volumes: this.chimpJobConfig.volumes,
            }),
            restartPolicy: "Never", // Chimps are ephemeral - don't restart on exit
          },
        },
        backoffLimit: 0, // Don't retry failed jobs
        ttlSecondsAfterFinished: 0,
      },
    };

    try {
      await this.k8sBatchApi.createNamespacedJob({
        namespace: this.namespace,
        body: job,
      });
      logger.info({ jobName, chimpId }, "Created job");
    } catch (error) {
      // Handle race condition - another ringmaster may have created it
      if (isK8sConflict(error)) {
        logger.debug(
          { jobName },
          "Job already exists (race condition), continuing",
        );
        return;
      }
      throw error;
    }
  }
}
