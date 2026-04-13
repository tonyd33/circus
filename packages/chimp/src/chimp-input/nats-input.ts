import { Standards } from "@mnke/circus-shared";
import { createLogger } from "@mnke/circus-shared/logger";
import { parseChimpCommand } from "@mnke/circus-shared/protocol";
import type { Consumer, NatsConnection } from "nats";
import {
  type ActivityCallback,
  ChimpInput,
  type MessageHandler,
} from "./chimp-input";

const logger = createLogger("NatsInput");

export class NatsInput extends ChimpInput {
  private nc: NatsConnection;
  private chimpId: string;
  private handler: MessageHandler;
  private onActivity: ActivityCallback;
  private onStopRequested: () => Promise<void>;
  private consumer: Consumer | null = null;
  private stopConsumer: (() => void) | null = null;

  constructor(
    nc: NatsConnection,
    chimpId: string,
    handler: MessageHandler,
    onActivity: ActivityCallback,
    onStopRequested: () => Promise<void>,
  ) {
    super();
    this.nc = nc;
    this.chimpId = chimpId;
    this.handler = handler;
    this.onActivity = onActivity;
    this.onStopRequested = onStopRequested;
  }

  async start(): Promise<void> {
    const js = this.nc.jetstream();
    const streamName = Standards.Chimp.Naming.inputStreamName();
    const consumerName = `chimp-${this.chimpId}`;
    this.consumer = await js.consumers.get(streamName, consumerName);
    logger.info({ consumerName }, "Connected to JetStream consumer");

    const messages = await this.consumer.consume();
    this.stopConsumer = () => messages.stop();

    // Fire-and-forget async loop (like ringmaster message-listener)
    (async () => {
      try {
        for await (const msg of messages) {
          this.onActivity();
          logger.info(
            { subject: msg.subject, seq: msg.seq },
            "Received message",
          );

          try {
            const payload = JSON.parse(msg.string());
            const command = parseChimpCommand(payload);
            const result = await this.handler(command);

            msg.ack();
            logger.info({ seq: msg.seq }, "Processed message successfully");

            if (result === "stop") {
              await this.onStopRequested();
              return;
            }
          } catch (error) {
            logger.error({ err: error }, "Error processing message");
            msg.ack();
          }
        }
      } catch (error) {
        logger.error({ err: error }, "Error in message processing loop");
        await this.onStopRequested();
      }
    })();
  }

  async stop(): Promise<void> {
    if (this.stopConsumer) {
      this.stopConsumer();
      this.stopConsumer = null;
    }
  }
}
