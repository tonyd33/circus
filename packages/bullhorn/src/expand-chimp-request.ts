import type { Protocol, Standards } from "@mnke/circus-shared";

type Topic = Standards.Topic.Topic;

/**
 * Expand a chimp-request output message into a sequence of orchestration
 * actions. Bullhorn publishes each onto meta.orchestration.>; ringmaster
 * consumes them.
 */
export function expandChimpRequest(
  request: Protocol.ChimpOutputMessage & { type: "chimp-request" },
  msgTimestamp: Date,
): Protocol.OrchestrationAction[] {
  const directTopic: Topic = {
    platform: "direct",
    chimpId: request.chimpId,
  };

  return [
    {
      type: "set-profile",
      chimpId: request.chimpId,
      profile: request.profile,
    },
    {
      type: "subscribe-topic",
      chimpId: request.chimpId,
      topic: directTopic,
    },
    {
      type: "ensure-consumers",
      chimpId: request.chimpId,
      deliverFrom: { type: "time", value: msgTimestamp },
    },
    {
      type: "ensure-job",
      chimpId: request.chimpId,
    },
  ];
}
