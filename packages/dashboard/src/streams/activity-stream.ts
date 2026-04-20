import { type Logger, Protocol, Standards } from "@mnke/circus-shared";
import type { TopicRegistry } from "@mnke/circus-shared/lib";
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
  type: "command" | "output" | "event";
  messageType: string;
  timestamp: string;
  data: Protocol.ChimpCommand | Protocol.ChimpOutputMessage | unknown;
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

          if (type === "command") {
            const parsed = Protocol.safeParseChimpCommand(raw);
            event = {
              id: `${type}-${msg.seq}`,
              type,
              messageType: parsed.success ? parsed.data.command : "unknown",
              timestamp: new Date(
                millis(msg.info.timestampNanos),
              ).toISOString(),
              data: parsed.success ? parsed.data : raw,
            };
          } else if (type === "output") {
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
          } else {
            event = {
              id: `${type}-${msg.seq}`,
              type,
              messageType: "event",
              timestamp: new Date(
                millis(msg.info.timestampNanos),
              ).toISOString(),
              data: raw,
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
    // Commands (direct commands to this chimp)
    await addConsumer(
      Standards.Chimp.Naming.commandsStreamName(),
      Standards.Chimp.Naming.commandSubject(chimpId),
      "command",
    );

    // Outputs (messages from this chimp)
    await addConsumer(
      Standards.Chimp.Naming.outputsStreamName(),
      Standards.Chimp.Naming.outputSubject(chimpId),
      "output",
    );

    // Events (topics this chimp subscribes to)
    const topics = await topicRegistry.listForChimp(chimpId);
    if (topics.length > 0) {
      const eventFilters = topics.map(Standards.Topic.topicToEventSubject);
      await addConsumer(
        Standards.Chimp.Naming.eventsStreamName(),
        eventFilters,
        "event",
      );
    }
  } catch (e) {
    logger.error({ err: e }, "Failed to subscribe to activity");
    controller?.error(e instanceof Error ? e : new Error(String(e)));
  }

  return stream;
}
