/**
 * An event context the chimp has been exposed to, paired with the time
 * it was first observed. Collected across turns so the chimp can respond
 * on a platform/channel other than the one that triggered the current
 * turn (e.g. user pings on Discord, later asks via GitHub; chimp can
 * still reach the original Discord interaction).
 */
import type { Protocol } from "@mnke/circus-shared";

export type StoredEventContext = Protocol.StoredEventContext;

/**
 * Append `ctx` to `list` unless a structurally-equal context is already
 * present. Returns the new list when a context was appended, or the
 * original list reference when the incoming context was a duplicate.
 *
 * Dashboard and `unknown` contexts are naturally singletons under this
 * rule because their shapes have no differentiating fields.
 */
export function appendUniqueEventContext(
  list: StoredEventContext[],
  ctx: Protocol.EventContext,
  now: () => Date = () => new Date(),
): StoredEventContext[] {
  const alreadyPresent = list.some((entry) =>
    Bun.deepEquals(entry.context, ctx),
  );
  if (alreadyPresent) return list;
  return [...list, { seenAt: now().toISOString(), context: ctx }];
}

export const KNOWN_EVENT_CONTEXTS_HEADER =
  "The following event contexts are channels you have been exposed to " +
  "across this session. You can use the platform-specific MCP response " +
  "tools to reply on any of them, not just the one that triggered the " +
  "current turn.";

/**
 * Produce the system prompt for the next turn, appending a
 * `<known_event_contexts>` block describing every platform/channel the
 * chimp has seen when any are recorded. Returns `base` unchanged when
 * `contexts` is empty.
 */
export function composeSystemPromptWithEventContexts(
  base: string | undefined,
  contexts: StoredEventContext[],
): string | undefined {
  if (contexts.length === 0) return base;
  const entries = contexts.map((c) => JSON.stringify(c)).join("\n");
  const block = `<known_event_contexts>\n${KNOWN_EVENT_CONTEXTS_HEADER}\n${entries}\n</known_event_contexts>`;
  return base ? `${base}\n\n${block}` : block;
}
