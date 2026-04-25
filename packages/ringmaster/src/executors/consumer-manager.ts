import { Standards } from "@mnke/circus-shared";
import { NatsLib } from "@mnke/circus-shared/lib";
import type * as Logger from "@mnke/circus-shared/logger";
import {
  AckPolicy,
  type ConsumerConfig,
  DeliverPolicy,
  type JetStreamManager,
} from "nats";

export type DeliverFrom =
  | { type: "sequence"; value: number }
  | { type: "time"; value: Date };

export class ConsumerManager {
  private jsm: JetStreamManager;
  private logger: Logger.Logger;

  constructor(jsm: JetStreamManager, logger: Logger.Logger) {
    this.jsm = jsm;
    this.logger = logger;
  }

  async ensureConsumer(
    chimpId: string,
    filterSubjects: string[],
    deliverFrom: DeliverFrom,
  ): Promise<void> {
    const streamName = Standards.Chimp.Naming.eventsStreamName();
    const consumerName = Standards.Chimp.Naming.eventConsumerName(chimpId);

    try {
      await this.jsm.consumers.info(streamName, consumerName);
      this.logger.debug({ consumerName, chimpId }, "Consumer already exists");
      return;
    } catch (error) {
      if (!NatsLib.isNatsNotFound(error)) throw error;
    }

    const deliverConfig: Partial<ConsumerConfig> =
      deliverFrom.type === "sequence"
        ? {
            deliver_policy: DeliverPolicy.StartSequence,
            opt_start_seq: deliverFrom.value,
          }
        : {
            deliver_policy: DeliverPolicy.StartTime,
            opt_start_time: deliverFrom.value.toISOString(),
          };

    try {
      await this.jsm.consumers.add(streamName, {
        durable_name: consumerName,
        ack_policy: AckPolicy.Explicit,
        filter_subjects: filterSubjects,
        ...deliverConfig,
      });
      this.logger.info(
        { consumerName, chimpId, filterSubjects, deliverFrom },
        "Created consumer",
      );
    } catch (error) {
      if (NatsLib.isNatsAlreadyExists(error)) {
        this.logger.debug(
          { consumerName, chimpId },
          "Consumer already exists (race), continuing",
        );
        return;
      }
      throw error;
    }
  }

  async deleteConsumer(chimpId: string): Promise<void> {
    const streamName = Standards.Chimp.Naming.eventsStreamName();
    const consumerName = Standards.Chimp.Naming.eventConsumerName(chimpId);

    try {
      await this.jsm.consumers.delete(streamName, consumerName);
      this.logger.info({ consumerName, chimpId }, "Deleted consumer");
    } catch (error) {
      if (NatsLib.isNatsNotFound(error)) {
        this.logger.debug(
          { consumerName, chimpId },
          "Consumer doesn't exist, skipping",
        );
      } else {
        throw error;
      }
    }
  }
}
