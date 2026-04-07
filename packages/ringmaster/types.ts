/**
 * Ringmaster - Types
 *
 * The Ringmaster manages Chimp lifecycle (pods + NATS streams)
 */

/**
 * Chimp status
 */
export type ChimpStatus = "pending" | "running" | "failed" | "unknown";

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
 * Naming conventions
 */
export class ChimpNaming {
  static streamName(chimpName: string): string {
    return `chimp-${chimpName}`;
  }

  static inputSubject(chimpName: string): string {
    return `chimp.${chimpName}.input`;
  }

  static outputSubject(chimpName: string): string {
    return `chimp.${chimpName}.output`;
  }

  static controlSubject(chimpName: string): string {
    return `chimp.${chimpName}.control`;
  }

  static podName(chimpName: string): string {
    return `chimp-${chimpName.toLowerCase()}`;
  }

  static redisSessionKey(chimpName: string): string {
    return `session:${chimpName}`;
  }

  static redisChimpKey(chimpName: string): string {
    return `chimp:${chimpName}`;
  }

  static redisHealthKey(chimpName: string): string {
    return `chimp:${chimpName}:health`;
  }

  static correlationSubject(chimpName: string): string {
    return `chimp.${chimpName}.correlation`;
  }

  static heartbeatSubject(chimpName: string): string {
    return `chimp.${chimpName}.heartbeat`;
  }

  static consumerName(chimpName: string): string {
    return `chimp-${chimpName}-consumer`;
  }
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
