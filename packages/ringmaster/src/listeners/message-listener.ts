/**
 * Ringmaster - Message Listener
 *
 * Listens to NATS for incoming messages to trigger faster Chimp creation
 * Borrows NATS connection from Ringmaster - does not own the connection lifecycle
 */

import { type Logger, Standards } from "@mnke/circus-shared";
import {
  AckPolicy,
  type Consumer,
  DeliverPolicy,
  type NatsConnection,
} from "nats";
import type { EventHandler } from "../core/event-handler.ts";

const MESSAGE_LISTENER_CONSUMER_NAME = "chimp-message-listener";

export class MessageListener {
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

  /**
   * Start listening for input messages
   */
  async start(): Promise<void> {
    const js = this.nc.jetstream();
    const jsm = await this.nc.jetstreamManager();
    const streamName = Standards.Chimp.Naming.inputStreamName();

    const consumer = await jsm.consumers.add(streamName, {
      durable_name: MESSAGE_LISTENER_CONSUMER_NAME,
      ack_policy: AckPolicy.Explicit,
      filter_subject: `${Standards.Chimp.Prefix.INPUTS}.>`,
      deliver_policy: DeliverPolicy.LastPerSubject,
    });

    this.consumer = js.consumers.getPullConsumerFor(consumer);

    this.logger.info("Created consumer for chimp.inputs.*");

    const messages = await this.consumer.consume();
    this.stopConsumer = () => messages.stop();

    (async () => {
      for await (const msg of messages) {
        try {
          const parsed = Standards.Chimp.Naming.parseInputSubject(msg.subject);
          if (!parsed) {
            this.logger.error(
              { subject: msg.subject },
              "Invalid subject format",
            );
            msg.ack();
            continue;
          }

          const { chimpId, profile } = parsed;
          const messageSequence = msg.seq;
          this.logger.info(
            { chimpId, profile, messageSequence },
            "Detected message for chimp",
          );

          await this.eventHandler.handle(chimpId, {
            type: "message_received",
            messageSequence,
          });

          msg.ack();
        } catch (error) {
          this.logger.error({ err: error }, "Error processing message");
          msg.ack();
        }
      }
    })();
  }

  /**
   * Stop listening for messages
   */
  async stop(): Promise<void> {
    if (this.stopConsumer) {
      this.stopConsumer();
      this.stopConsumer = null;
    }

    this.consumer = null;

    this.logger.info("Stopped");
  }
}
