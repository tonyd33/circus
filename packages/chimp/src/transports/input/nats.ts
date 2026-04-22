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
  private stopCallbacks: (() => void)[] = [];
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
    const streamName = Standards.Chimp.Naming.eventsStreamName();
    const consumerName = Standards.Chimp.Naming.eventConsumerName(this.chimpId);

    try {
      const consumer = await js.consumers.get(streamName, consumerName);
      this.logger.info({ consumerName }, "Connected to consumer");
      this.consumeFrom(consumer);
    } catch {
      this.logger.info(
        "No consumer yet — will receive messages once subscribed to topics",
      );
    }
  }

  private consumeFrom(consumer: Consumer): void {
    (async () => {
      const messages = await consumer.consume();
      this.stopCallbacks.push(() => messages.stop());

      try {
        for await (const msg of messages) {
          this.onActivity();
          this.logger.info(
            { subject: msg.subject, seq: msg.seq },
            "Received message",
          );

          const payload = JSON.parse(msg.string());
          const command = Protocol.parseChimpCommand(payload);
          const result = await this.handler(command);

          msg.ack();
          this.logger.info({ seq: msg.seq }, "Processed message");

          if (result === "stop") {
            await this.onStopRequested();
            return;
          }
        }
      } catch (error) {
        this.logger.error({ err: error }, "Error in message processing loop");
        await this.onStopRequested();
      }
    })();
  }

  async stop(): Promise<void> {
    for (const stop of this.stopCallbacks) {
      stop();
    }
    this.stopCallbacks = [];
  }
}
