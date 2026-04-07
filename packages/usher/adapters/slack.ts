/**
 * Usher - Slack Event Adapter
 *
 * Normalizes Slack events to the common format
 */

import type { NormalizedEvent } from "../types.ts";

/**
 * Normalize a Slack event to the common format
 */
export function normalizeSlackEvent(payload: unknown): NormalizedEvent | null {
  // Type guard: ensure payload is an object
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const p = payload as Record<string, unknown>;

  // Handle Slack events API
  if (p.type === "event_callback") {
    const event = p.event as Record<string, unknown>;

    // Message events
    if (event.type === "message" && !event.subtype) {
      return {
        source: "slack",
        eventType: "message",
        identifiers: {
          channelId: event.channel as string,
          threadId: (event.thread_ts || event.ts) as string,
          userId: event.user as string,
        },
        userId: event.user as string,
        content: (event.text as string) || "",
        raw: payload,
      };
    }

    // App mention events
    if (event.type === "app_mention") {
      return {
        source: "slack",
        eventType: "mention",
        identifiers: {
          channelId: event.channel as string,
          threadId: (event.thread_ts || event.ts) as string,
          userId: event.user as string,
        },
        userId: event.user as string,
        content: (event.text as string) || "",
        raw: payload,
      };
    }
  }

  // Handle slash commands
  if (p.command) {
    return {
      source: "slack",
      eventType: "slash_command",
      identifiers: {
        channelId: p.channel_id as string,
        userId: p.user_id as string,
      },
      userId: p.user_id as string,
      content: `${p.command} ${p.text || ""}`,
      raw: payload,
    };
  }

  // Handle interactive components (buttons, modals, etc.)
  if (p.type === "block_actions" || p.type === "view_submission") {
    const user = p.user as Record<string, unknown>;
    const channel = p.channel as Record<string, unknown> | undefined;
    return {
      source: "slack",
      eventType: p.type as string,
      identifiers: {
        channelId: channel?.id as string | undefined,
        userId: user.id as string,
      },
      userId: user.id as string,
      content: JSON.stringify(p.actions || p.view),
      raw: payload,
    };
  }

  return null;
}

/**
 * Verify Slack request signature
 */
export function verifySlackSignature(
  body: string,
  timestamp: string,
  signature: string,
  signingSecret: string,
): boolean {
  const crypto = require("node:crypto");

  // Check timestamp to prevent replay attacks (within 5 minutes)
  const now = Math.floor(Date.now() / 1000);
  if (Math.abs(now - parseInt(timestamp, 10)) > 300) {
    return false;
  }

  // Compute expected signature
  const baseString = `v0:${timestamp}:${body}`;
  const hmac = crypto.createHmac("sha256", signingSecret);
  hmac.update(baseString);
  const expectedSignature = `v0=${hmac.digest("hex")}`;

  // Compare signatures
  return crypto.timingSafeEqual(
    Buffer.from(expectedSignature),
    Buffer.from(signature),
  );
}
