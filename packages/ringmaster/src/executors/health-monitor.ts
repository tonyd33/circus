/**
 * Health Monitor
 *
 * Monitors the health of critical ringmaster components (pod watcher, listeners, etc).
 * Provides visibility into component state for alerting and debugging.
 */

import type { Logger } from "@mnke/circus-shared";
import type { PodWatcher } from "@/listeners";

export interface ComponentHealth {
  name: string;
  isHealthy: boolean;
  details?: Record<string, any>;
  lastError?: string;
  lastCheck?: number;
}

export class HealthMonitor {
  private logger: Logger.Logger;
  private components = new Map<string, ComponentHealth>();

  constructor(logger: Logger.Logger) {
    this.logger = logger;
  }

  /**
   * Register a component for health monitoring
   */
  registerComponent(
    name: string,
    isHealthy: boolean,
    details?: Record<string, any>,
  ): void {
    this.components.set(name, {
      name,
      isHealthy,
      details,
      lastCheck: Date.now(),
    });
  }

  /**
   * Update component health status
   */
  updateComponentHealth(
    name: string,
    isHealthy: boolean,
    details?: Record<string, any>,
    error?: string,
  ): void {
    const existing = this.components.get(name);
    this.components.set(name, {
      name,
      isHealthy,
      details,
      lastError: error || existing?.lastError,
      lastCheck: Date.now(),
    });
  }

  /**
   * Get health status of all components
   */
  getStatus(): {
    healthy: boolean;
    components: ComponentHealth[];
    timestamp: number;
  } {
    const components = Array.from(this.components.values());
    const healthy = components.every((c) => c.isHealthy);

    return {
      healthy,
      components,
      timestamp: Date.now(),
    };
  }

  /**
   * Get specific component health
   */
  getComponentHealth(name: string): ComponentHealth | undefined {
    return this.components.get(name);
  }

  /**
   * Check pod watcher health based on its status
   */
  checkPodWatcherHealth(watcher: PodWatcher): void {
    const health = watcher.getHealthStatus();
    const isHealthy = health.isRunning && health.consecutiveFailures === 0;
    const secondsSinceConnection = health.lastSuccessfulConnection
      ? Math.round((Date.now() - health.lastSuccessfulConnection) / 1000)
      : null;

    this.updateComponentHealth(
      "pod-watcher",
      isHealthy,
      {
        running: health.isRunning,
        consecutiveFailures: health.consecutiveFailures,
        secondsSinceLastConnection: secondsSinceConnection,
      },
      isHealthy ? undefined : "Pod watcher has failures or is not running",
    );

    if (!isHealthy) {
      this.logger.warn(
        {
          isRunning: health.isRunning,
          consecutiveFailures: health.consecutiveFailures,
          secondsSinceConnection,
        },
        "Pod watcher health check failed",
      );
    }
  }
}
