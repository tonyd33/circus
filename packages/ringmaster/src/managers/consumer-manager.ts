/**
 * Ringmaster - Consumer Manager
 *
 * Manages NATS JetStream consumers for Chimps on the shared input stream
 * Borrows NATS connection from Ringmaster - does not own the connection lifecycle
 */

import { Logger, Standards } from "@mnke/circus-shared";
import {
  isNatsAlreadyExists,
  isNatsNotFound,
} from "@mnke/circus-shared/errors";
import { AckPolicy, DeliverPolicy, type JetStreamManager } from "nats";

const logger = Logger.createLogger("ConsumerManager");

export class ConsumerManager {
  private jsm: JetStreamManager;

  constructor(jsm: JetStreamManager) {
    this.jsm = jsm;
  }

  /**
   * Ensure a consumer exists for a chimp on the shared input stream (idempotent)
   */
  async ensureConsumer(chimpId: string, startSequence: number): Promise<void> {
    const inputStreamName = Standards.Chimp.Naming.inputStreamName();
    const consumerName = `chimp-${chimpId}`;

    try {
      await this.jsm.consumers.info(inputStreamName, consumerName);
      logger.debug(
        { consumerName, chimpId },
        "Consumer already exists, skipping creation",
      );
      return;
    } catch (error) {
      if (isNatsNotFound(error)) {
      } else {
        throw error;
      }
    }

    try {
      await this.jsm.consumers.add(inputStreamName, {
        durable_name: consumerName,
        ack_policy: AckPolicy.Explicit,
        filter_subject: Standards.Chimp.Naming.inputSubject(chimpId),
        deliver_policy: DeliverPolicy.StartSequence,
        opt_start_seq: startSequence,
      });

      logger.info({ consumerName, chimpId, startSequence }, "Created consumer");
    } catch (error) {
      // Handle race condition
      if (isNatsAlreadyExists(error)) {
        logger.debug(
          { consumerName, chimpId },
          "Consumer already exists (race condition), continuing",
        );
        return;
      }
      throw error;
    }
  }

  /**
   * Delete a consumer for a chimp on the shared input stream (idempotent)
   */
  async deleteConsumer(chimpId: string): Promise<void> {
    const inputStreamName = Standards.Chimp.Naming.inputStreamName();
    const consumerName = `chimp-${chimpId}`;

    try {
      await this.jsm.consumers.delete(inputStreamName, consumerName);
      logger.info({ consumerName, chimpId }, "Deleted consumer");
    } catch (error) {
      if (isNatsNotFound(error)) {
        logger.debug(
          { consumerName, chimpId },
          "Consumer doesn't exist, skipping deletion",
        );
        return;
      }
      throw error;
    }
  }
}
