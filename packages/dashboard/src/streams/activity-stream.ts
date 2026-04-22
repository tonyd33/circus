import { type Logger, Protocol, Standards } from "@mnke/circus-shared";
import type { TopicRegistry } from "@mnke/circus-shared/lib";
import {
  AckPolicy,
  type Consumer,
  type ConsumerMessages,
  DeliverPolicy,
  millis,
  type NatsConnection,
  type Subscription,
} from "nats";

const PING_INTERVAL_MS = 3_000;

interface ActivityEvent {
  id: string;
  type: "event" | "output" | "meta";
  messageType: string;
  timestamp: string;
  data:
    | Protocol.ChimpCommand
    | Protocol.ChimpOutputMessage
    | Protocol.MetaEvent
    | unknown;
}

export async function createActivityStream(
  chimpId: string,
  nc: NatsConnection,
  topicRegistry: TopicRegistry,
  logger: Logger.Logger,
): Promise<ReadableStream> {
  const js = nc.jetstream();
  const jsm = await nc.jetstreamManager();

  const encoder = new TextEncoder();
  let controller: ReadableStreamDefaultController<Uint8Array> | undefined;
  const allMessages: ConsumerMessages[] = [];
  const allConsumers: Consumer[] = [];
  const allSubscriptions: Subscription[] = [];
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
      for (const msgs of allMessages) msgs.stop();
      for (const consumer of allConsumers) {
        consumer
          .delete()
          .catch((e) =>
            logger.error({ err: e }, "Failed to delete activity consumer"),
          );
      }
      for (const sub of allSubscriptions) sub.unsubscribe();
    },
  });

  function processMessages(
    messages: ConsumerMessages,
    type: ActivityEvent["type"],
  ): void {
    (async () => {
      try {
        for await (const msg of messages) {
          const raw: unknown = msg.json();
          let event: ActivityEvent;

          if (type === "event") {
            const parsed = Protocol.safeParseChimpCommand(raw);
            event = {
              id: `${type}-${msg.seq}`,
              type,
              messageType: parsed.success ? parsed.data.command : "event",
              timestamp: new Date(
                millis(msg.info.timestampNanos),
              ).toISOString(),
              data: parsed.success ? parsed.data : raw,
            };
          } else {
            const parsed = Protocol.safeParseChimpOutputMessage(raw);
            event = {
              id: `${type}-${msg.seq}`,
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

  function emitEvent(event: ActivityEvent): void {
    controller?.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
  }

  async function addConsumer(
    streamName: string,
    filterSubject: string | string[],
    type: ActivityEvent["type"],
  ): Promise<void> {
    const config: Record<string, unknown> = {
      ack_policy: AckPolicy.None,
      deliver_policy: DeliverPolicy.All,
    };
    if (Array.isArray(filterSubject)) {
      config.filter_subjects = filterSubject;
    } else {
      config.filter_subject = filterSubject;
    }
    const info = await jsm.consumers.add(streamName, config);
    const consumer = await js.consumers.get(streamName, info.name);
    allConsumers.push(consumer);
    const messages = await consumer.consume();
    allMessages.push(messages);
    processMessages(messages, type);
  }

  try {
    // Events + direct commands (single stream)
    const topics = await topicRegistry.listForChimp(chimpId);
    const eventFilters = [
      Standards.Chimp.Naming.directSubject(chimpId),
      ...topics.map(Standards.Topic.topicToEventSubject),
    ];
    await addConsumer(
      Standards.Chimp.Naming.eventsStreamName(),
      eventFilters,
      "event",
    );

    // Outputs (messages from this chimp)
    await addConsumer(
      Standards.Chimp.Naming.outputsStreamName(),
      Standards.Chimp.Naming.outputSubject(chimpId),
      "output",
    );

    // Meta events (plain NATS — no stream, live only)
    const metaSub = nc.subscribe(Standards.Chimp.Naming.metaSubject(chimpId));
    allSubscriptions.push(metaSub);
    (async () => {
      for await (const msg of metaSub) {
        try {
          const raw = msg.json() as unknown;
          const parsed = Protocol.MetaEventSchema.safeParse(raw);
          if (!parsed.success) continue;
          emitEvent({
            id: `meta-${parsed.data.timestamp}`,
            type: "meta",
            messageType: parsed.data.type,
            timestamp: parsed.data.timestamp,
            data: parsed.data,
          });
        } catch {
          // best-effort
        }
      }
    })();
  } catch (e) {
    logger.error({ err: e }, "Failed to subscribe to activity");
    controller?.error(e instanceof Error ? e : new Error(String(e)));
  }

  return stream;
}
