/**
 * Ringmaster - Types
 *
 * The Ringmaster manages Chimp lifecycle (pods + NATS streams)
 */

/**
 * Chimp status
 * - pending: Pod is starting up
 * - running: Pod is running and healthy
 * - stopped: Pod exited normally (idle timeout, explicit stop) - can be restarted
 * - failed: Pod crashed or failed
 * - unknown: Status unknown (initial state or after cleanup)
 */
export type ChimpStatus =
  | "pending"
  | "running"
  | "stopped"
  | "failed"
  | "unknown";

/**
 * Chimp state in Redis
 */
export interface ChimpState {
  chimpName: string;
  podName: string;
  streamName: string;
  createdAt: number;
  status: ChimpStatus;
}

/**
 * Chimp health (with TTL)
 */
export interface ChimpHealth {
  lastHeartbeat: number;
  messageCount: number;
}

/**
 * Configuration for Ringmaster
 */
export interface RingmasterConfig {
  redisUrl: string;
  natsUrl: string;
  namespace: string;
  chimpImage: string;
  anthropicApiKey: string;
  reconcileInterval: number; // ms
}

/**
 * Heartbeat event from Chimp
 */
export interface HeartbeatEvent {
  chimpName: string;
  timestamp: number;
  messageCount: number;
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
