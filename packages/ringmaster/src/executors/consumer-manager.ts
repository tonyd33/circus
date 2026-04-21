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

  async ensureEventConsumer(
    chimpId: string,
    filterSubjects: string[],
    startSequence: number,
  ): Promise<void> {
    const streamName = Standards.Chimp.Naming.eventsStreamName();
    const consumerName = Standards.Chimp.Naming.eventConsumerName(chimpId);

    try {
      await this.jsm.consumers.info(streamName, consumerName);
      this.logger.debug(
        { consumerName, chimpId },
        "Event consumer already exists",
      );
      return;
    } catch (error) {
      if (!NatsLib.isNatsNotFound(error)) throw error;
    }

    try {
      await this.jsm.consumers.add(streamName, {
        durable_name: consumerName,
        ack_policy: AckPolicy.Explicit,
        filter_subjects: filterSubjects,
        deliver_policy: DeliverPolicy.StartSequence,
        opt_start_seq: startSequence,
      });
      this.logger.info(
        { consumerName, chimpId, filterSubjects, startSequence },
        "Created event consumer",
      );
    } catch (error) {
      if (NatsLib.isNatsAlreadyExists(error)) {
        this.logger.debug(
          { consumerName, chimpId },
          "Event consumer already exists (race), continuing",
        );
        return;
      }
      throw error;
    }
  }

  async ensureCommandConsumer(
    chimpId: string,
    startSequence: number,
  ): Promise<void> {
    const streamName = Standards.Chimp.Naming.commandsStreamName();
    const consumerName = Standards.Chimp.Naming.commandConsumerName(chimpId);

    try {
      await this.jsm.consumers.info(streamName, consumerName);
      this.logger.debug(
        { consumerName, chimpId },
        "Command consumer already exists",
      );
      return;
    } catch (error) {
      if (!NatsLib.isNatsNotFound(error)) throw error;
    }

    try {
      await this.jsm.consumers.add(streamName, {
        durable_name: consumerName,
        ack_policy: AckPolicy.Explicit,
        filter_subject: Standards.Chimp.Naming.commandSubject(chimpId),
        deliver_policy: DeliverPolicy.StartSequence,
        opt_start_seq: startSequence,
      });
      this.logger.info({ consumerName, chimpId }, "Created command consumer");
    } catch (error) {
      if (NatsLib.isNatsAlreadyExists(error)) {
        this.logger.debug(
          { consumerName, chimpId },
          "Command consumer already exists (race), continuing",
        );
        return;
      }
      throw error;
    }
  }

  async deleteConsumers(chimpId: string): Promise<void> {
    const eventsStream = Standards.Chimp.Naming.eventsStreamName();
    const eventConsumer = Standards.Chimp.Naming.eventConsumerName(chimpId);
    const commandsStream = Standards.Chimp.Naming.commandsStreamName();
    const commandConsumer = Standards.Chimp.Naming.commandConsumerName(chimpId);

    const pairs: [string, string][] = [
      [eventsStream, eventConsumer],
      [commandsStream, commandConsumer],
    ];
    for (const [stream, consumer] of pairs) {
      try {
        await this.jsm.consumers.delete(stream, consumer);
        this.logger.info({ consumer, chimpId }, "Deleted consumer");
      } catch (error) {
        if (NatsLib.isNatsNotFound(error)) {
          this.logger.debug(
            { consumer, chimpId },
            "Consumer doesn't exist, skipping",
          );
        } else {
          throw error;
        }
      }
    }
  }
}
