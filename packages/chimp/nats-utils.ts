/**
 * NATS publishing utilities
 */
import type { NatsConnection } from "nats";

/**
 * Publish a JSON message to a NATS subject
 * Abstracts the nc.publish(subject, JSON.stringify(message)) pattern
 */
export function publishJson(
  nc: NatsConnection,
  subject: string,
  message: unknown,
): void {
  nc.publish(subject, JSON.stringify(message));
}
