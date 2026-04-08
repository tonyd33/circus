/**
 * Ringmaster - Reconciler
 *
 * Watches Redis for sessions and ensures Chimps are healthy
 * Now uses pure core logic for decision-making
 */

import { createLogger } from "@mnke/circus-shared/logger";
import type { ServiceMetrics } from "@mnke/circus-shared/metrics";
import type Redis from "ioredis";
import { handleEvent } from "./adapters/core-adapter.ts";
import type { RingmasterConfig } from "./core/types.ts";
import {
  type CompletionEvent,
  CompletionListener,
} from "./listeners/completion-listener.ts";
import { HeartbeatListener } from "./listeners/heartbeat-listener.ts";
import { MessageListener } from "./listeners/message-listener.ts";
import { OutputListener } from "./listeners/output-listener.ts";
import { PodWatcher } from "./listeners/pod-watcher.ts";
import { PodManager } from "./managers/pod-manager.ts";
import { StreamManager } from "./managers/stream-manager.ts";

const logger = createLogger("Reconciler");

export class Reconciler {
  private podManager: PodManager;
  private streamManager: StreamManager;
  private heartbeatListener: HeartbeatListener;
  private outputListener: OutputListener;
  private messageListener: MessageListener;
  private podWatcher: PodWatcher;
  private completionListener: CompletionListener;
  private redis: Redis;
  private metrics: ServiceMetrics;
  private reconcileInterval: number;
  private intervalHandle: Timer | null = null;
  private idleTimeoutMs: number;

  constructor(
    config: RingmasterConfig,
    redis: Redis,
    metrics: ServiceMetrics,
    idleTimeoutMs: number = 300_000, // 5 minutes default
  ) {
    this.podManager = new PodManager(config);
    this.streamManager = new StreamManager(config);
    this.heartbeatListener = new HeartbeatListener(
      config,
      redis,
      this.podManager,
      this.streamManager,
    );
    this.outputListener = new OutputListener(config, redis, idleTimeoutMs);
    this.messageListener = new MessageListener(config, (chimpName) =>
      this.handleChimpNeeded(chimpName),
    );
    this.podWatcher = new PodWatcher(
      config,
      redis,
      this.podManager,
      this.streamManager,
    );
    this.completionListener = new CompletionListener(
      config,
      (chimpName, event) => this.handleChimpCompleted(chimpName, event),
    );
    this.redis = redis;
    this.metrics = metrics;
    this.reconcileInterval = config.reconcileInterval;
    this.idleTimeoutMs = idleTimeoutMs;
  }

  /**
   * Initialize the reconciler
   */
  async start(): Promise<void> {
    await Promise.all([
      this.streamManager.connect(),
      this.heartbeatListener.start(),
      this.outputListener.start(),
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
    await this.outputListener.stop();
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
    const startTime = Date.now();
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

      const duration = (Date.now() - startTime) / 1000;
      this.metrics.recordNatsProcessed("reconcile", true, duration);
      logger.info({ duration }, "Reconciliation cycle complete");
    } catch (error) {
      logger.error({ err: error }, "Error during reconciliation");
      this.metrics.recordError("reconciliation", "error");
      const duration = (Date.now() - startTime) / 1000;
      this.metrics.recordNatsProcessed("reconcile", false, duration);
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

    try {
      // Use core logic to decide what to do
      await handleEvent(
        chimpName,
        { type: "completion", reason: event.reason },
        {
          redis: this.redis,
          podManager: this.podManager,
          streamManager: this.streamManager,
        },
      );
    } catch (error) {
      logger.error(
        { err: error, chimpName },
        "Error handling chimp completion",
      );
      this.metrics.recordError("chimp_completion", "error");
    }
  }

  /**
   * Handle a request to ensure a Chimp exists (triggered by incoming message)
   * This provides fast, event-driven Chimp creation
   */
  private async handleChimpNeeded(chimpName: string): Promise<void> {
    logger.info({ chimpName }, "Chimp needed");

    try {
      // Use core logic to decide what to do
      await handleEvent(
        chimpName,
        { type: "message_received" },
        {
          redis: this.redis,
          podManager: this.podManager,
          streamManager: this.streamManager,
        },
      );
    } catch (error) {
      logger.error({ err: error, chimpName }, "Error handling chimp needed");
      this.metrics.recordError("chimp_needed", "error");
    }
  }

  /**
   * Reconcile a single Chimp
   */
  private async reconcileChimp(chimpName: string): Promise<void> {
    // Use core logic to decide what to do
    await handleEvent(
      chimpName,
      { type: "reconcile_tick" },
      {
        redis: this.redis,
        podManager: this.podManager,
        streamManager: this.streamManager,
      },
      {
        maxHeartbeatAge: 30_000, // 30 seconds
        maxIdleAge: this.idleTimeoutMs,
      },
    );
  }
}
