/**
 * Prometheus Metrics Module
 *
 * Provides a centralized way to register and expose Prometheus metrics
 * across all Circus services.
 */

import {
  Counter,
  collectDefaultMetrics,
  Gauge,
  Histogram,
  Registry,
} from "prom-client";

/**
 * Metrics configuration for a service
 */
export interface MetricsConfig {
  /**
   * Service name (e.g., "bullhorn", "usher", "chimp", "ringmaster")
   */
  serviceName: string;

  /**
   * Whether to collect default metrics (CPU, memory, etc.)
   * @default true
   */
  collectDefaultMetrics?: boolean;

  /**
   * Custom registry to use
   * If not provided, creates a new registry
   */
  registry?: Registry;
}

/**
 * Metrics manager for a service
 *
 * Provides common metrics and utilities for all services
 */
export class ServiceMetrics {
  public readonly registry: Registry;
  public readonly serviceName: string;

  // Common metrics available to all services
  public readonly httpRequestDuration: Histogram<string>;
  public readonly httpRequestTotal: Counter<string>;
  public readonly natsMessagesPublished: Counter<string>;
  public readonly natsMessagesReceived: Counter<string>;
  public readonly natsMessagesProcessed: Counter<string>;
  public readonly natsMessageProcessingDuration: Histogram<string>;
  public readonly errorTotal: Counter<string>;
  public readonly activeConnections: Gauge<string>;

  constructor(config: MetricsConfig) {
    this.serviceName = config.serviceName;
    this.registry = config.registry || new Registry();

    // Collect default metrics if enabled
    if (config.collectDefaultMetrics !== false) {
      collectDefaultMetrics({
        register: this.registry,
        prefix: `circus_${this.serviceName}_`,
      });
    }

    // HTTP metrics
    this.httpRequestDuration = new Histogram({
      name: `circus_${this.serviceName}_http_request_duration_seconds`,
      help: "Duration of HTTP requests in seconds",
      labelNames: ["method", "route", "status"],
      registers: [this.registry],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5],
    });

    this.httpRequestTotal = new Counter({
      name: `circus_${this.serviceName}_http_requests_total`,
      help: "Total number of HTTP requests",
      labelNames: ["method", "route", "status"],
      registers: [this.registry],
    });

    // NATS metrics
    this.natsMessagesPublished = new Counter({
      name: `circus_${this.serviceName}_nats_messages_published_total`,
      help: "Total number of NATS messages published",
      labelNames: ["subject"],
      registers: [this.registry],
    });

    this.natsMessagesReceived = new Counter({
      name: `circus_${this.serviceName}_nats_messages_received_total`,
      help: "Total number of NATS messages received",
      labelNames: ["subject"],
      registers: [this.registry],
    });

    this.natsMessagesProcessed = new Counter({
      name: `circus_${this.serviceName}_nats_messages_processed_total`,
      help: "Total number of NATS messages processed successfully",
      labelNames: ["subject", "status"],
      registers: [this.registry],
    });

    this.natsMessageProcessingDuration = new Histogram({
      name: `circus_${this.serviceName}_nats_message_processing_duration_seconds`,
      help: "Duration of NATS message processing in seconds",
      labelNames: ["subject"],
      registers: [this.registry],
      buckets: [0.01, 0.05, 0.1, 0.5, 1, 2, 5, 10],
    });

    // Error metrics
    this.errorTotal = new Counter({
      name: `circus_${this.serviceName}_errors_total`,
      help: "Total number of errors",
      labelNames: ["type", "severity"],
      registers: [this.registry],
    });

    // Connection metrics
    this.activeConnections = new Gauge({
      name: `circus_${this.serviceName}_active_connections`,
      help: "Number of active connections",
      labelNames: ["type"],
      registers: [this.registry],
    });
  }

  /**
   * Get metrics in Prometheus format
   */
  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  /**
   * Get metrics content type
   */
  getContentType(): string {
    return this.registry.contentType;
  }

  /**
   * Create a new counter metric
   */
  createCounter(
    name: string,
    help: string,
    labelNames?: string[],
  ): Counter<string> {
    return new Counter({
      name: `circus_${this.serviceName}_${name}`,
      help,
      labelNames,
      registers: [this.registry],
    });
  }

  /**
   * Create a new gauge metric
   */
  createGauge(
    name: string,
    help: string,
    labelNames?: string[],
  ): Gauge<string> {
    return new Gauge({
      name: `circus_${this.serviceName}_${name}`,
      help,
      labelNames,
      registers: [this.registry],
    });
  }

  /**
   * Create a new histogram metric
   */
  createHistogram(
    name: string,
    help: string,
    labelNames?: string[],
    buckets?: number[],
  ): Histogram<string> {
    return new Histogram({
      name: `circus_${this.serviceName}_${name}`,
      help,
      labelNames,
      buckets,
      registers: [this.registry],
    });
  }

  /**
   * Record an HTTP request
   */
  recordHttpRequest(
    method: string,
    route: string,
    status: number,
    duration: number,
  ): void {
    this.httpRequestTotal.inc({ method, route, status: status.toString() });
    this.httpRequestDuration.observe(
      { method, route, status: status.toString() },
      duration,
    );
  }

  /**
   * Record a NATS message published
   */
  recordNatsPublish(subject: string): void {
    this.natsMessagesPublished.inc({ subject });
  }

  /**
   * Record a NATS message received
   */
  recordNatsReceived(subject: string): void {
    this.natsMessagesReceived.inc({ subject });
  }

  /**
   * Record a NATS message processed
   */
  recordNatsProcessed(
    subject: string,
    success: boolean,
    duration: number,
  ): void {
    this.natsMessagesProcessed.inc({
      subject,
      status: success ? "success" : "error",
    });
    this.natsMessageProcessingDuration.observe({ subject }, duration);
  }

  /**
   * Record an error
   */
  recordError(
    type: string,
    severity: "warning" | "error" | "fatal" = "error",
  ): void {
    this.errorTotal.inc({ type, severity });
  }

  /**
   * Set active connections
   */
  setActiveConnections(type: string, count: number): void {
    this.activeConnections.set({ type }, count);
  }

  /**
   * Increment active connections
   */
  incActiveConnections(type: string): void {
    this.activeConnections.inc({ type });
  }

  /**
   * Decrement active connections
   */
  decActiveConnections(type: string): void {
    this.activeConnections.dec({ type });
  }
}

/**
 * Create a metrics instance for a service
 */
export function createMetrics(config: MetricsConfig): ServiceMetrics {
  return new ServiceMetrics(config);
}
