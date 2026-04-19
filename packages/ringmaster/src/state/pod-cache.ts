import * as k8s from "@kubernetes/client-node";
import type { Logger } from "@mnke/circus-shared";
import { K8sLib } from "@/lib";

const { CHIMP_ID, MANAGED_BY } = K8sLib.Labels;

export class PodCache {
  private informer: k8s.Informer<k8s.V1Pod> & k8s.ObjectCache<k8s.V1Pod>;
  private logger: Logger.Logger;

  constructor(namespace: string, logger: Logger.Logger) {
    this.logger = logger;

    const kc = new k8s.KubeConfig();
    kc.loadFromDefault();

    const coreApi = kc.makeApiClient(k8s.CoreV1Api);
    const labelSelector = `${MANAGED_BY}=ringmaster`;

    this.informer = k8s.makeInformer(
      kc,
      `/api/v1/namespaces/${namespace}/pods`,
      () => coreApi.listNamespacedPod({ namespace, labelSelector }),
      labelSelector,
    ) as k8s.Informer<k8s.V1Pod> & k8s.ObjectCache<k8s.V1Pod>;

    this.informer.on("error", (err) => {
      this.logger.error({ err }, "Pod informer error");
    });
  }

  async start(): Promise<void> {
    await this.informer.start();
    this.logger.info("Pod cache started");
  }

  async stop(): Promise<void> {
    await this.informer.stop();
    this.logger.info("Pod cache stopped");
  }

  getPod(chimpId: string): k8s.V1Pod | undefined {
    const pods = this.informer.list();
    return pods.find((pod) => pod.metadata?.labels?.[CHIMP_ID] === chimpId);
  }
}
