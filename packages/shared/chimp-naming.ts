/**
 * Chimp Naming Conventions
 *
 * Provides standardized naming schemes for chimp-related resources
 * across NATS, Kubernetes, and Redis
 */

/**
 * Naming conventions for chimp resources
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
