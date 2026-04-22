import { type Logger, Standards } from "@mnke/circus-shared";
import { NatsLib } from "@mnke/circus-shared/lib";
import { AckPolicy, DeliverPolicy, type JetStreamManager } from "nats";

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
    startSequence: number,
  ): Promise<void> {
    const streamName = Standards.Chimp.Naming.eventsStreamName();
    const consumerName = Standards.Chimp.Naming.eventConsumerName(chimpId);
    const directSubject = Standards.Chimp.Naming.directSubject(chimpId);

    const subjects = filterSubjects.includes(directSubject)
      ? filterSubjects
      : [...filterSubjects, directSubject];

    try {
      await this.jsm.consumers.info(streamName, consumerName);
      this.logger.debug({ consumerName, chimpId }, "Consumer already exists");
      return;
    } catch (error) {
      if (!NatsLib.isNatsNotFound(error)) throw error;
    }

    try {
      await this.jsm.consumers.add(streamName, {
        durable_name: consumerName,
        ack_policy: AckPolicy.Explicit,
        filter_subjects: subjects,
        deliver_policy: DeliverPolicy.StartSequence,
        opt_start_seq: startSequence,
      });
      this.logger.info(
        { consumerName, chimpId, filterSubjects: subjects, startSequence },
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
