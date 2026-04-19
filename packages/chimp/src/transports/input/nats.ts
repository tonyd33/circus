import { type Logger, Protocol, Standards } from "@mnke/circus-shared";
import type { Consumer, NatsConnection } from "nats";
import {
  type ActivityCallback,
  ChimpInput,
  type MessageHandler,
} from "./input";

export class NatsInput extends ChimpInput {
  private nc: NatsConnection;
  private chimpId: string;
  private handler: MessageHandler;
  private onActivity: ActivityCallback;
  private onStopRequested: () => Promise<void>;
  private consumer: Consumer | null = null;
  private stopConsumer: (() => void) | null = null;
  private logger: Logger.Logger;

  constructor(
    nc: NatsConnection,
    chimpId: string,
    handler: MessageHandler,
    onActivity: ActivityCallback,
    onStopRequested: () => Promise<void>,
    logger: Logger.Logger,
  ) {
    super();
    this.nc = nc;
    this.chimpId = chimpId;
    this.handler = handler;
    this.onActivity = onActivity;
    this.onStopRequested = onStopRequested;
    this.logger = logger;
  }

  async start(): Promise<void> {
    const js = this.nc.jetstream();
    const streamName = Standards.Chimp.Naming.inputStreamName();
    const consumerName = `chimp-${this.chimpId}`;
    this.consumer = await js.consumers.get(streamName, consumerName);
    this.logger.info({ consumerName }, "Connected to JetStream consumer");

    const messages = await this.consumer.consume();
    this.stopConsumer = () => messages.stop();

    (async () => {
      try {
        for await (const msg of messages) {
          this.onActivity();
          this.logger.info(
            { subject: msg.subject, seq: msg.seq },
            "Received message",
          );

          try {
            const payload = JSON.parse(msg.string());
            const command = Protocol.parseChimpCommand(payload);
            const result = await this.handler(command);

            msg.ack();
            this.logger.info(
              { seq: msg.seq },
              "Processed message successfully",
            );

            if (result === "stop") {
              await this.onStopRequested();
              return;
            }
          } catch (error) {
            this.logger.error({ err: error }, "Error processing message");
            msg.ack();
          }
        }
      } catch (error) {
        this.logger.error({ err: error }, "Error in message processing loop");
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
