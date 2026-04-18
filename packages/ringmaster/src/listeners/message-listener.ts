/**
 * Ringmaster - Message Listener
 *
 * Listens to NATS for incoming messages to trigger faster Chimp creation
 * Borrows NATS connection from Ringmaster - does not own the connection lifecycle
 */

import { Logger, Standards } from "@mnke/circus-shared";
import {
  AckPolicy,
  type Consumer,
  DeliverPolicy,
  type NatsConnection,
} from "nats";
import type { RingmasterEventHandler } from "../core/event-handler.ts";

const MESSAGE_LISTENER_CONSUMER_NAME = "chimp-message-listener";

const logger = Logger.createLogger("MessageListener");

export class MessageListener {
  private nc: NatsConnection;
  private consumer: Consumer | null = null;
  private eventHandler: RingmasterEventHandler;
  private stopConsumer: (() => void) | null = null;

  constructor(nc: NatsConnection, eventHandler: RingmasterEventHandler) {
    this.nc = nc;
    this.eventHandler = eventHandler;
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

    logger.info("Created ephemeral consumer for chimps.inputs.*");

    const messages = await this.consumer.consume();
    this.stopConsumer = () => messages.stop();

    (async () => {
      for await (const msg of messages) {
        try {
          const parsed = Standards.Chimp.Naming.parseInputSubject(msg.subject);
          if (!parsed) {
            logger.error({ subject: msg.subject }, "Invalid subject format");
            msg.ack();
            continue;
          }

          const { chimpId, profile } = parsed;
          const messageSequence = msg.seq;
          logger.info(
            { chimpId, profile, messageSequence },
            "Detected message for chimp",
          );

          await this.eventHandler(chimpId, {
            type: "message_received",
            messageSequence,
          });

          msg.ack();
        } catch (error) {
          logger.error({ err: error }, "Error processing message");
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

    logger.info("Stopped");
  }
}
