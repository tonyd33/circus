/**
 * Ringmaster - Message Listener
 *
 * Listens to NATS for incoming messages to trigger faster Chimp creation
 * Borrows NATS connection from Ringmaster - does not own the connection lifecycle
 */

import { Standards } from "@mnke/circus-shared";
import { createLogger } from "@mnke/circus-shared/logger";
import {
  AckPolicy,
  type Consumer,
  DeliverPolicy,
  type NatsConnection,
} from "nats";
import type { RingmasterEventHandler } from "../core/event-handler.ts";

const MESSAGE_LISTENER_CONSUMER_NAME = "chimp-message-listener";

const logger = createLogger("MessageListener");

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

    // Create ephemeral consumer for detecting new messages on all chimp inputs
    // Delivers new messages only (DeliverPolicy.New)
    const consumer = await jsm.consumers.add(streamName, {
      durable_name: MESSAGE_LISTENER_CONSUMER_NAME,
      ack_policy: AckPolicy.Explicit,
      filter_subject: `${Standards.Chimp.Prefix.INPUTS}.>`,
      deliver_policy: DeliverPolicy.LastPerSubject,
    });

    // Get the consumer we just created (ephemeral, so no durable name needed)
    this.consumer = js.consumers.getPullConsumerFor(consumer);

    logger.info("Created ephemeral consumer for chimps.inputs.*");

    // Process incoming messages
    const messages = await this.consumer.consume();
    this.stopConsumer = () => messages.stop();

    (async () => {
      try {
        for await (const msg of messages) {
          try {
            // Extract chimpId from subject (chimps.inputs.{chimpId})
            const parts = msg.subject.split(".");
            if (
              parts.length === 3 &&
              parts[0] === "chimps" &&
              parts[1] === "inputs"
            ) {
              const chimpId = parts[2];
              if (!chimpId) {
                logger.error(
                  { subject: msg.subject },
                  "Invalid subject format",
                );
                msg.ack();
                continue;
              }

              // Extract message sequence number from JetStream metadata
              const messageSequence = msg.seq;
              logger.info(
                { chimpId, messageSequence },
                "Detected message for chimp",
              );

              // Trigger Chimp creation (if needed)
              await this.eventHandler(chimpId, {
                type: "message_received",
                messageSequence,
              });

              // Acknowledge the message
              msg.ack();
            }
          } catch (error) {
            logger.error({ err: error }, "Error processing message");
            msg.ack();
          }
        }
      } catch (error) {
        logger.error({ err: error }, "Message consumer error");
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
