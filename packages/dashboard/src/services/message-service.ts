import { Protocol, Standards } from "@mnke/circus-shared";
import type * as Logger from "@mnke/circus-shared/logger";
import type { NatsConnection } from "nats";

export class MessageService {
  constructor(
    private nc: NatsConnection,
    private logger: Logger.Logger,
  ) {}

  async sendCommand(chimpId: string, prompt: string): Promise<void> {
    const js = this.nc.jetstream();
    await js.publish(
      Standards.Chimp.Naming.directSubject(chimpId),
      JSON.stringify(Protocol.createAgentCommand(prompt)),
    );
  }

  createMetaEventStream(): ReadableStream<Uint8Array> {
    const nc = this.nc;
    const log = this.logger;
    const sub = nc.subscribe(Standards.Chimp.Naming.lifecycleFilter());

    return new ReadableStream<Uint8Array>({
      start(controller) {
        (async () => {
          try {
            for await (const msg of sub) {
              const raw = msg.json();
              const parsed = Protocol.MetaEventSchema.safeParse(raw);

              if (!parsed.success) {
                log.warn({ error: parsed.error.issues }, "Invalid meta event");
                continue;
              }

              const payload = JSON.stringify(parsed.data);
              controller.enqueue(
                new TextEncoder().encode(`data: ${payload}\n\n`),
              );
            }
          } catch (e) {
            log.error({ err: e }, "Meta events stream error");
            controller.error(e);
          }
        })();
      },
      cancel() {
        sub.unsubscribe();
      },
    });
  }
}
