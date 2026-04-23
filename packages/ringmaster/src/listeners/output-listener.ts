import { type Logger, Protocol, Standards } from "@mnke/circus-shared";
import {
  AckPolicy,
  type Consumer,
  DeliverPolicy,
  millis,
  type NatsConnection,
} from "nats";
import type { StateManager } from "@/executors";
import type { EventHandler } from "../core/event-handler.ts";

const OUTPUT_LISTENER_CONSUMER_NAME = "output-listener";

export class OutputListener {
  private nc: NatsConnection;
  private eventHandler: EventHandler;
  private stateManager: StateManager;
  private consumer: Consumer | null = null;
  private stopConsumer: (() => void) | null = null;
  private logger: Logger.Logger;

  constructor(
    nc: NatsConnection,
    eventHandler: EventHandler,
    stateManager: StateManager,
    logger: Logger.Logger,
  ) {
    this.nc = nc;
    this.eventHandler = eventHandler;
    this.stateManager = stateManager;
    this.logger = logger;
  }

  async start(): Promise<void> {
    const js = this.nc.jetstream();
    const jsm = await this.nc.jetstreamManager();
    const streamName = Standards.Chimp.Naming.outputsStreamName();

    const consumerInfo = await jsm.consumers.add(streamName, {
      durable_name: OUTPUT_LISTENER_CONSUMER_NAME,
      ack_policy: AckPolicy.Explicit,
      filter_subject: `${Standards.Chimp.Prefix.OUTPUTS}.>`,
      deliver_policy: DeliverPolicy.New,
    });
    this.consumer = await js.consumers.get(streamName, consumerInfo.name);
    const messages = await this.consumer.consume();
    this.stopConsumer = () => messages.stop();
    this.logger.info("Consuming outputs via JetStream");

    (async () => {
      for await (const msg of messages) {
        try {
          const chimpId = msg.subject.slice(
            Standards.Chimp.Prefix.OUTPUTS.length + 1,
          );
          if (!chimpId) {
            msg.ack();
            continue;
          }

          const parsed = Protocol.safeParseChimpOutputMessage(msg.json());
          if (!parsed.success) {
            msg.ack();
            continue;
          }

          const timestamp = new Date(millis(msg.info.timestampNanos));

          // Look up chimp profile from state
          const chimpState = await this.stateManager.get(chimpId);
          const profile = chimpState?.profile ?? "unknown";

          await this.eventHandler.handleEvent({
            type: "chimp_output",
            chimpId,
            profile,
            message: parsed.data,
            timestamp,
          });

          msg.ack();
        } catch (error) {
          this.logger.error({ err: error }, "Error processing output");
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
