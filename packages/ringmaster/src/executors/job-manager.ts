/**
 * Ringmaster - Job Manager
 *
 * Manages Kubernetes job lifecycle for Chimps
 */

import * as k8s from "@kubernetes/client-node";
import { type Logger, Standards } from "@mnke/circus-shared";
import type { ProfileLoader } from "@/config";
import type { RingmasterConfig } from "@/core";
import { type ChimpJobConfig, K8sLib } from "@/lib";

export class JobManager {
  private k8sBatchApi: k8s.BatchV1Api;
  private namespace: string;
  private natsUrl: string;
  private profileLoader: ProfileLoader;
  private chimpJobConfig: ChimpJobConfig.ChimpJobConfig;
  private logger: Logger.Logger;

  constructor(
    config: RingmasterConfig,
    profileLoader: ProfileLoader,
    logger: Logger.Logger,
  ) {
    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();

    this.k8sBatchApi = kc.makeApiClient(k8s.BatchV1Api);
    this.namespace = config.namespace;
    this.natsUrl = config.natsUrl;
    this.profileLoader = profileLoader;
    this.chimpJobConfig = config.chimpJobConfig;
    this.logger = logger;
  }

  async start(): Promise<void> {}

  async stop(): Promise<void> {}

  /**
   * Create a Chimp job (idempotent)
   */
  async createJob(chimpId: string, profile: string): Promise<void> {
    const jobName = Standards.Chimp.Naming.podName(chimpId);

    const profileData = this.profileLoader.getProfile(profile);
    const brainType = profileData.brain;
    const model = profileData.model;
    const image = profileData.image;

    const job: k8s.V1Job = {
      apiVersion: "batch/v1",
      kind: "Job",
      metadata: {
        name: jobName,
        namespace: this.namespace,
        labels: {
          app: "chimp",
          [K8sLib.Labels.CHIMP_ID]: chimpId,
          [K8sLib.Labels.CHIMP_PROFILE]: profile,
          [K8sLib.Labels.MANAGED_BY]: "ringmaster",
        },
      },
      spec: {
        template: {
          metadata: {
            labels: {
              app: "chimp",
              [K8sLib.Labels.CHIMP_ID]: chimpId,
              [K8sLib.Labels.CHIMP_PROFILE]: profile,
              [K8sLib.Labels.MANAGED_BY]: "ringmaster",
            },
          },
          spec: {
            containers: [
              {
                name: "chimp",
                image,
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
                    value: brainType,
                  },
                  {
                    name: Standards.Chimp.Env.model,
                    value: model,
                  },
                  {
                    name: Standards.Chimp.Env.profile,
                    value: profile,
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
      this.logger.info({ jobName, chimpId }, "Created job");
    } catch (error) {
      // Handle race condition - another ringmaster may have created it
      if (K8sLib.isK8sConflict(error)) {
        this.logger.debug(
          { jobName },
          "Job already exists (race condition), continuing",
        );
        return;
      }
      throw error;
    }
  }
}
