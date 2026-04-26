import { Protocol, Standards } from "@mnke/circus-shared";
import type * as Logger from "@mnke/circus-shared/logger";
import {
  AckPolicy,
  type Consumer,
  DeliverPolicy,
  millis,
  type NatsConnection,
} from "nats";
import type { EventHandler } from "../core/event-handler.ts";

export class OrchestrationListener {
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
    const streamName = Standards.Chimp.Naming.orchestrationStreamName();

    const consumer = await jsm.consumers.add(streamName, {
      durable_name: Standards.Chimp.Naming.orchestrationConsumerName(),
      ack_policy: AckPolicy.Explicit,
      filter_subject: Standards.Chimp.Naming.orchestrationFilter(),
      deliver_policy: DeliverPolicy.All,
    });

    this.consumer = js.consumers.getPullConsumerFor(consumer);
    this.logger.info("Created consumer for meta.orchestration.>");

    const messages = await this.consumer.consume();
    this.stopConsumer = () => messages.stop();

    (async () => {
      for await (const msg of messages) {
        try {
          const raw = msg.json();
          const parsed = Protocol.safeParseOrchestrationAction(raw);
          if (!parsed.success) {
            this.logger.warn(
              { subject: msg.subject, issues: parsed.error.issues },
              "Invalid orchestration action",
            );
            msg.ack();
            continue;
          }

          await this.eventHandler.handleEvent({
            type: "orchestration_action",
            action: parsed.data,
            timestamp: new Date(millis(msg.info.timestampNanos)),
          });
          msg.ack();
        } catch (error) {
          this.logger.error(
            { err: error, subject: msg.subject },
            "Error processing orchestration action",
          );
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
