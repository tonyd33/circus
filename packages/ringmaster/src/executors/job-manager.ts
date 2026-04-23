import * as k8s from "@kubernetes/client-node";
import { type Logger, Standards } from "@mnke/circus-shared";
import type { ProfileLoader } from "@/config";
import type { RingmasterConfig } from "@/core";
import { K8sLib } from "@/lib";

export class JobManager {
  private k8sBatchApi: k8s.BatchV1Api;
  private namespace: string;
  private natsUrl: string;
  private redisUrl: string;
  private databaseUrl: string;
  private profileLoader: ProfileLoader;
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
    this.redisUrl = config.redisUrl;
    this.databaseUrl = config.databaseUrl;
    this.profileLoader = profileLoader;
    this.logger = logger;
  }

  async start(): Promise<void> {}

  async stop(): Promise<void> {}

  async createJob(chimpId: string, profile: string): Promise<void> {
    const jobName = Standards.Chimp.Naming.podName(chimpId);
    const profileData = await this.profileLoader.getProfile(profile);

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
                image: profileData.image,
                imagePullPolicy: profileData.imagePullPolicy ?? "Never",
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
                    value: profileData.brain,
                  },
                  {
                    name: Standards.Chimp.Env.model,
                    value: profileData.model,
                  },
                  {
                    name: Standards.Chimp.Env.profile,
                    value: profile,
                  },
                  {
                    name: Standards.Chimp.Env.redisUrl,
                    value: this.redisUrl,
                  },
                  {
                    name: Standards.Chimp.Env.databaseUrl,
                    value: this.databaseUrl,
                  },
                  ...profileData.extraEnv,
                ],
                ...(profileData.volumeMounts.length > 0 && {
                  volumeMounts: profileData.volumeMounts,
                }),
              },
            ],
            ...(profileData.volumes.length > 0 && {
              volumes: profileData.volumes,
            }),
            restartPolicy: "Never",
          },
        },
        backoffLimit: 0,
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

  async deleteJob(chimpId: string): Promise<void> {
    const jobName = Standards.Chimp.Naming.podName(chimpId);

    try {
      await this.k8sBatchApi.deleteNamespacedJob({
        namespace: this.namespace,
        name: jobName,
        body: { propagationPolicy: "Background" },
      });
      this.logger.info({ jobName, chimpId }, "Deleted job");
    } catch (error) {
      if (K8sLib.isK8sNotFound(error)) {
        this.logger.debug({ jobName, chimpId }, "Job not found, skipping");
        return;
      }
      throw error;
    }
  }
}
