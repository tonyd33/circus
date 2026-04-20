import { type Logger, Protocol, Standards } from "@mnke/circus-shared";
import type { NatsConnection, Subscription } from "nats";
import type { EventHandler } from "../core/event-handler.ts";

export class OutputListener {
  private nc: NatsConnection;
  private eventHandler: EventHandler;
  private sub: Subscription | null = null;
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
    const sub = this.nc.subscribe(`${Standards.Chimp.Prefix.OUTPUTS}.>`);
    this.sub = sub;
    this.logger.info("Subscribed to outputs.>");

    (async () => {
      for await (const msg of sub) {
        try {
          const chimpId = msg.subject.slice(
            Standards.Chimp.Prefix.OUTPUTS.length + 1,
          );
          if (!chimpId) continue;

          const parsed = Protocol.safeParseChimpOutputMessage(msg.json());
          if (!parsed.success) continue;

          await this.eventHandler.handleEvent({
            type: "chimp_output",
            chimpId,
            message: parsed.data,
          });
        } catch (error) {
          this.logger.error({ err: error }, "Error processing output");
        }
      }
    })();
  }

  async stop(): Promise<void> {
    if (this.sub) {
      this.sub.unsubscribe();
      this.sub = null;
    }
    this.logger.info("Stopped");
  }
}
