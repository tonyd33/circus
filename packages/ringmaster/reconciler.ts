/**
 * Ringmaster - Reconciler
 *
 * Watches Redis for sessions and ensures Chimps are healthy
 */

import type Redis from "ioredis";
import { createLogger } from "@mnke/circus-shared/logger";
import {
  type CompletionEvent,
  CompletionListener,
} from "./completion-listener.ts";
import { HeartbeatListener } from "./heartbeat-listener.ts";
import { MessageListener } from "./message-listener.ts";
import { PodManager } from "./pod-manager.ts";
import { PodWatcher } from "./pod-watcher.ts";
import { StreamManager } from "./stream-manager.ts";
import {
  type ChimpHealth,
  ChimpNaming,
  type ChimpState,
  type RingmasterConfig,
} from "./types.ts";

const logger = createLogger("Reconciler");

export class Reconciler {
  private podManager: PodManager;
  private streamManager: StreamManager;
  private heartbeatListener: HeartbeatListener;
  private messageListener: MessageListener;
  private podWatcher: PodWatcher;
  private completionListener: CompletionListener;
  private redis: Redis;
  private reconcileInterval: number;
  private intervalHandle: Timer | null = null;

  constructor(config: RingmasterConfig, redis: Redis) {
    this.podManager = new PodManager(config);
    this.streamManager = new StreamManager(config);
    this.heartbeatListener = new HeartbeatListener(config, redis);
    this.messageListener = new MessageListener(config, (chimpName) =>
      this.handleChimpNeeded(chimpName),
    );
    this.podWatcher = new PodWatcher(config, redis, (chimpName) =>
      this.handlePodFailed(chimpName),
    );
    this.completionListener = new CompletionListener(
      config,
      (chimpName, event) => this.handleChimpCompleted(chimpName, event),
    );
    this.redis = redis;
    this.reconcileInterval = config.reconcileInterval;
  }

  /**
   * Initialize the reconciler
   */
  async start(): Promise<void> {
    await Promise.all([
      this.streamManager.connect(),
      this.heartbeatListener.start(),
      this.messageListener.start(),
      this.podWatcher.start(),
      this.completionListener.start(),
    ]);
    logger.info("Ringmaster reconciler started");

    // Run reconciliation immediately
    await this.reconcile();

    // Schedule periodic reconciliation
    this.intervalHandle = setInterval(() => {
      this.reconcile().catch((error) => {
        logger.error({ err: error }, "Reconciliation error");
      });
    }, this.reconcileInterval);
  }

  /**
   * Stop the reconciler
   */
  async stop(): Promise<void> {
    if (this.intervalHandle) {
      clearInterval(this.intervalHandle);
      this.intervalHandle = null;
    }

    await this.completionListener.stop();
    await this.podWatcher.stop();
    await this.messageListener.stop();
    await this.heartbeatListener.stop();
    await this.streamManager.close();
    logger.info("Ringmaster reconciler stopped");
  }

  /**
   * Main reconciliation loop
   *
   * For each session in Redis:
   * 1. Check if Chimp health exists (TTL-based)
   * 2. If unhealthy/missing: ensure pod + stream exist
   */
  async reconcile(): Promise<void> {
    logger.info("Starting reconciliation cycle");

    try {
      // Get all session keys from Redis
      const sessionKeys = await this.redis.keys("session:*");

      logger.info({ count: sessionKeys.length }, "Found sessions");

      for (const sessionKey of sessionKeys) {
        // Extract chimpName from session key (session:chimpName)
        const chimpName = sessionKey.replace("session:", "");

        await this.reconcileChimp(chimpName);
      }

      logger.info("Reconciliation cycle complete");
    } catch (error) {
      logger.error({ err: error }, "Error during reconciliation");
      throw error;
    }
  }

  /**
   * Handle Chimp completion (triggered by completion event from Chimp)
   * This provides immediate cleanup when Chimps shut down gracefully
   */
  private async handleChimpCompleted(
    chimpName: string,
    event: CompletionEvent,
  ): Promise<void> {
    logger.info(
      { chimpName, reason: event.reason, messageCount: event.messageCount },
      "Chimp completed",
    );

    // Clear health
    const healthKey = ChimpNaming.redisHealthKey(chimpName);
    await this.redis.del(healthKey);

    // Update state to mark as completed
    const chimpKey = ChimpNaming.redisChimpKey(chimpName);
    const stateData = await this.redis.get(chimpKey);

    if (stateData) {
      const state: ChimpState = JSON.parse(stateData);
      state.status = "unknown"; // Will be recreated on next message
      await this.redis.set(chimpKey, JSON.stringify(state));
    }

    // Delete pod (will be recreated on demand)
    await this.podManager.deletePod(chimpName);

    logger.info({ chimpName }, "Cleaned up Chimp");
  }

  /**
   * Handle pod failure (triggered by Kubernetes pod watcher)
   * This provides immediate recovery when pods crash or fail
   */
  private async handlePodFailed(chimpName: string): Promise<void> {
    logger.info({ chimpName }, "Pod failed, ensuring recreation");

    // Ensure Chimp exists (will create new pod)
    await this.ensureChimpExists(chimpName);
  }

  /**
   * Handle a request to ensure a Chimp exists (triggered by incoming message)
   * This provides fast, event-driven Chimp creation
   */
  private async handleChimpNeeded(chimpName: string): Promise<void> {
    logger.info({ chimpName }, "Chimp needed");

    // Check Chimp health in Redis
    const healthKey = ChimpNaming.redisHealthKey(chimpName);
    const healthData = await this.redis.get(healthKey);

    if (healthData) {
      const health: ChimpHealth = JSON.parse(healthData);
      const age = Date.now() - health.lastHeartbeat;

      if (age < 30_000) {
        // Healthy - heartbeat within last 30s
        logger.info({ chimpName }, "Chimp is already healthy");
        return;
      }
    }

    // Chimp is unhealthy or missing - ensure it exists
    logger.info({ chimpName }, "Creating Chimp on-demand");
    await this.ensureChimpExists(chimpName);
  }

  /**
   * Reconcile a single Chimp
   */
  private async reconcileChimp(chimpName: string): Promise<void> {
    // Check Chimp health in Redis
    const healthKey = ChimpNaming.redisHealthKey(chimpName);
    const healthData = await this.redis.get(healthKey);

    if (healthData) {
      const health: ChimpHealth = JSON.parse(healthData);
      const age = Date.now() - health.lastHeartbeat;

      if (age < 30_000) {
        // Healthy - heartbeat within last 30s
        logger.info({ chimpName, ageMs: age }, "Chimp is healthy");
        return;
      }

      logger.info({ chimpName, ageMs: age }, "Chimp health expired");
    } else {
      logger.info({ chimpName }, "Chimp has no health data");
    }

    // Chimp is unhealthy or missing - ensure it exists
    await this.ensureChimpExists(chimpName);
  }

  /**
   * Ensure a Chimp's pod and stream exist
   *
   * Note: All operations are idempotent - they check if resources exist
   * before creating. This handles race conditions gracefully without locks.
   */
  private async ensureChimpExists(chimpName: string): Promise<void> {
    logger.info({ chimpName }, "Ensuring Chimp exists");

    try {
      // Create stream + consumer (idempotent)
      await this.streamManager.createStream(chimpName);
      await this.streamManager.createConsumer(chimpName);

      // Create pod (idempotent)
      await this.podManager.createPod(chimpName);

      // Update Chimp state in Redis
      const chimpKey = ChimpNaming.redisChimpKey(chimpName);
      const state: ChimpState = {
        chimpName,
        podName: ChimpNaming.podName(chimpName),
        streamName: ChimpNaming.streamName(chimpName),
        createdAt: Date.now(),
        status: "pending",
      };

      await this.redis.set(chimpKey, JSON.stringify(state));

      logger.info({ chimpName }, "Ensured Chimp exists");
    } catch (error) {
      logger.error({ chimpName, err: error }, "Failed to ensure Chimp exists");
      throw error;
    }
  }
}
