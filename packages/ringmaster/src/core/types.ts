/**
 * Ringmaster - Types
 *
 * The Ringmaster manages Chimp lifecycle (pods + NATS streams)
 */

import type { Standards } from "@mnke/circus-shared";

type ChimpStatus = Standards.Chimp.ChimpStatus;

export interface RingmasterConfig {
  natsUrl: string;
  redisUrl: string;
  namespace: string;
  profileTemplatePath?: string;
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
