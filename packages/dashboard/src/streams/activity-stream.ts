import { type Logger, Protocol, Standards } from "@mnke/circus-shared";
import {
  AckPolicy,
  type Consumer,
  type ConsumerMessages,
  DeliverPolicy,
  millis,
  type NatsConnection,
} from "nats";

const PING_INTERVAL_MS = 3_000;

interface ActivityEvent {
  id: string;
  type: "input" | "output";
  messageType: string;
  timestamp: string;
  data: Protocol.ChimpCommand | Protocol.ChimpOutputMessage | unknown;
}

export async function createActivityStream(
  profile: string,
  chimpId: string,
  nc: NatsConnection,
  logger: Logger.Logger,
): Promise<ReadableStream> {
  const js = nc.jetstream();
  const jsm = await nc.jetstreamManager();

  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  let inputMessages: ConsumerMessages | null = null;
  let outputMessages: ConsumerMessages | null = null;
  let inputConsumer: Consumer | null = null;
  let outputConsumer: Consumer | null = null;
  let pingInterval: ReturnType<typeof setInterval>;

  const stream = new ReadableStream<Uint8Array>({
    start(c) {
      controller = c;
      controller.enqueue(
        encoder.encode(`event: connected\ndata: {"status":"connected"}\n\n`),
      );
      pingInterval = setInterval(() => {
        controller?.enqueue(encoder.encode(`:ping\n\n`));
      }, PING_INTERVAL_MS);
    },
    cancel() {
      clearInterval(pingInterval);
      inputMessages?.stop();
      outputMessages?.stop();
      inputConsumer
        ?.delete()
        .catch((e) =>
          logger.error({ err: e }, "Failed to delete input consumer"),
        );
      outputConsumer
        ?.delete()
        .catch((e) =>
          logger.error({ err: e }, "Failed to delete output consumer"),
        );
    },
  });

  function processMessages(
    messages: ConsumerMessages,
    type: "input" | "output",
  ): void {
    (async () => {
      try {
        for await (const msg of messages) {
          const raw: unknown = msg.json();
          let event: ActivityEvent;

          if (type === "input") {
            const parsed = Protocol.safeParseChimpCommand(raw);
            event = {
              id: msg.seq.toString(),
              type,
              messageType: parsed.success ? parsed.data.command : "unknown",
              timestamp: new Date(
                millis(msg.info.timestampNanos),
              ).toISOString(),
              data: parsed.success ? parsed.data : raw,
            };
          } else {
            const parsed = Protocol.safeParseChimpOutputMessage(raw);
            event = {
              id: msg.seq.toString(),
              type,
              messageType: parsed.success ? parsed.data.type : "unknown",
              timestamp: new Date(
                millis(msg.info.timestampNanos),
              ).toISOString(),
              data: parsed.success ? parsed.data : raw,
            };
          }

          const ctrl = controller;
          if (ctrl) {
            ctrl.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
          }
        }
      } catch (e) {
        logger.error({ err: e, type }, "Activity stream error");
        controller?.error(e);
      }
    })();
  }

  const tasks: Promise<void>[] = [];
  try {
    const inputInfo = await jsm.consumers.add(
      Standards.Chimp.Naming.inputStreamName(),
      {
        ack_policy: AckPolicy.None,
        filter_subject: Standards.Chimp.Naming.inputSubject(profile, chimpId),
        deliver_policy: DeliverPolicy.All,
      },
    );
    inputConsumer = await js.consumers.get(
      Standards.Chimp.Naming.inputStreamName(),
      inputInfo.name,
    );
    inputMessages = await inputConsumer.consume();
    processMessages(inputMessages, "input");

    const outputInfo = await jsm.consumers.add(
      Standards.Chimp.Naming.outputStreamName(),
      {
        ack_policy: AckPolicy.None,
        filter_subject: Standards.Chimp.Naming.outputSubject(profile, chimpId),
        deliver_policy: DeliverPolicy.All,
      },
    );
    outputConsumer = await js.consumers.get(
      Standards.Chimp.Naming.outputStreamName(),
      outputInfo.name,
    );
    outputMessages = await outputConsumer.consume();
    processMessages(outputMessages, "output");
  } catch (e) {
    logger.error({ err: e }, "Failed to subscribe to activity");
    controller?.error(e instanceof Error ? e : new Error(String(e)));
  }

  return stream;
}
