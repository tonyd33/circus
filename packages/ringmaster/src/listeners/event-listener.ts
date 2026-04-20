import { type Logger, Standards } from "@mnke/circus-shared";
import {
  AckPolicy,
  type Consumer,
  DeliverPolicy,
  type NatsConnection,
} from "nats";
import type { EventHandler } from "../core/event-handler.ts";

const EVENT_LISTENER_CONSUMER_NAME = "event-listener";

export class EventListener {
  private nc: NatsConnection;
  private consumer: Consumer | null = null;
  private eventHandler: EventHandler;
  private stopConsumer: (() => void) | null = null;
  private logger: Logger.Logger;

  constructor(
    nc: NatsConnection,
    eventHandler: EventHandler,
    logger: Logger.Logger,
  ) {
    this.nc = nc;
    this.eventHandler = eventHandler;
    this.logger = logger;
  }

  async start(): Promise<void> {
    const js = this.nc.jetstream();
    const jsm = await this.nc.jetstreamManager();
    const streamName = Standards.Chimp.Naming.eventsStreamName();

    const consumer = await jsm.consumers.add(streamName, {
      durable_name: EVENT_LISTENER_CONSUMER_NAME,
      ack_policy: AckPolicy.Explicit,
      filter_subject: `${Standards.Chimp.Prefix.EVENTS}.>`,
      deliver_policy: DeliverPolicy.LastPerSubject,
    });

    this.consumer = js.consumers.getPullConsumerFor(consumer);
    this.logger.info("Created consumer for events.>");

    const messages = await this.consumer.consume();
    this.stopConsumer = () => messages.stop();

    (async () => {
      for await (const msg of messages) {
        try {
          const subject = msg.subject;
          const topic = Standards.Topic.eventSubjectToTopic(subject);
          const profile =
            msg.headers?.get("profile") ?? Standards.Chimp.DEFAULT_PROFILE;

          await this.eventHandler.handleEvent({
            type: "event_received",
            profile,
            eventSubject: subject,
            topic,
            messageSequence: msg.seq,
          });

          msg.ack();
        } catch (error) {
          this.logger.error({ err: error }, "Error processing event");
          msg.ack();
        }
      }
    })();
  }

  async stop(): Promise<void> {
    if (this.stopConsumer) {
      this.stopConsumer();
      this.stopConsumer = null;
    }
    this.consumer = null;
    this.logger.info("Stopped");
  }
}
