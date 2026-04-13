/**
 * Ringmaster - Types
 *
 * The Ringmaster manages Chimp lifecycle (pods + NATS streams)
 */

import type { ChimpStatus } from "@mnke/circus-shared/standards/chimp";
import type { ChimpJobConfig } from "../lib/chimp-job-config.ts";

/**
 * Configuration for Ringmaster
 */
export interface RingmasterConfig {
  natsUrl: string;
  redisUrl: string;
  namespace: string;
  chimpImage: string;
  chimpBrainType: string;
  chimpJobConfig: ChimpJobConfig;
}

/**
 * Pod event types from Kubernetes watch
 */
export type PodEventType = "ADDED" | "MODIFIED" | "DELETED";

/**
 * Pod phase from Kubernetes
 */
export type PodPhase =
  | "Pending"
  | "Running"
  | "Succeeded"
  | "Failed"
  | "Unknown";

/**
 * Actions that the effectful layer should perform
 */
export type Action =
  | { type: "create_job" }
  | { type: "create_consumer"; startSequence: number }
  | { type: "delete_consumer" }
  | { type: "upsert_state"; status: ChimpStatus }
  | { type: "delete_state" };
