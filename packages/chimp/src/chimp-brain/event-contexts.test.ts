import { describe, expect, test } from "bun:test";
import type { Protocol } from "@mnke/circus-shared";
import {
  appendUniqueEventContext,
  composeSystemPromptWithEventContexts,
  KNOWN_EVENT_CONTEXTS_HEADER,
} from "./event-contexts.ts";

const fixedNow = () => new Date("2026-04-20T00:00:00.000Z");

const discordCtx: Protocol.EventContext = {
  source: "discord",
  interactionToken: "tok-1",
  applicationId: "app-1",
};

const githubIssueCommentCtx: Protocol.EventContext = {
  source: "github",
  repo: "tonyd33/circus",
  installationId: 42,
  event: {
    name: "issue_comment.created",
    issueNumber: 54,
    isPR: false,
    commentId: 1,
    author: "tonyd33",
  },
};

const githubIssuesOpenedCtx: Protocol.EventContext = {
  source: "github",
  repo: "tonyd33/circus",
  installationId: 42,
  event: {
    name: "issues.opened",
    issueNumber: 54,
    author: "tonyd33",
    title: "Hello",
  },
};

const dashboardCtx: Protocol.EventContext = { source: "dashboard" };
const unknownCtx: Protocol.EventContext = { source: "unknown" };

describe("appendUniqueEventContext", () => {
  test("appends a new context with seenAt timestamp", () => {
    const result = appendUniqueEventContext([], discordCtx, fixedNow);
    expect(result).toEqual([
      { seenAt: "2026-04-20T00:00:00.000Z", context: discordCtx },
    ]);
  });

  test("returns the same list reference when context already present", () => {
    const list = appendUniqueEventContext([], discordCtx, fixedNow);
    const again = appendUniqueEventContext(list, discordCtx, fixedNow);
    expect(again).toBe(list);
  });

  test("dedupes by full structural equality, not just source", () => {
    const list1 = appendUniqueEventContext([], discordCtx, fixedNow);
    const list2 = appendUniqueEventContext(
      list1,
      { ...discordCtx, interactionToken: "tok-2" },
      fixedNow,
    );
    expect(list2.length).toBe(2);
  });

  test("treats different github event names on the same issue as distinct", () => {
    const list1 = appendUniqueEventContext([], githubIssueCommentCtx, fixedNow);
    const list2 = appendUniqueEventContext(
      list1,
      githubIssuesOpenedCtx,
      fixedNow,
    );
    expect(list2.length).toBe(2);
  });

  test("dashboard is a singleton (second append is a no-op)", () => {
    const list1 = appendUniqueEventContext([], dashboardCtx, fixedNow);
    const list2 = appendUniqueEventContext(list1, dashboardCtx, fixedNow);
    expect(list2).toBe(list1);
    expect(list2.length).toBe(1);
  });

  test("unknown is a singleton (second append is a no-op)", () => {
    const list1 = appendUniqueEventContext([], unknownCtx, fixedNow);
    const list2 = appendUniqueEventContext(list1, unknownCtx, fixedNow);
    expect(list2).toBe(list1);
    expect(list2.length).toBe(1);
  });

  test("dashboard + unknown coexist as distinct entries", () => {
    const list1 = appendUniqueEventContext([], dashboardCtx, fixedNow);
    const list2 = appendUniqueEventContext(list1, unknownCtx, fixedNow);
    expect(list2.length).toBe(2);
  });

  test("defaults seenAt to current time when no clock injected", () => {
    const before = Date.now();
    const list = appendUniqueEventContext([], discordCtx);
    const after = Date.now();
    expect(list).toHaveLength(1);
    const entry = list[0];
    if (!entry) throw new Error("expected one entry");
    const seen = new Date(entry.seenAt).getTime();
    expect(seen).toBeGreaterThanOrEqual(before);
    expect(seen).toBeLessThanOrEqual(after);
  });
});

describe("composeSystemPromptWithEventContexts", () => {
  test("returns the base prompt unchanged when no contexts recorded", () => {
    expect(composeSystemPromptWithEventContexts("base", [])).toBe("base");
    expect(composeSystemPromptWithEventContexts(undefined, [])).toBeUndefined();
  });

  test("appends a known_event_contexts block after the base prompt", () => {
    const list = appendUniqueEventContext([], discordCtx, fixedNow);
    const result = composeSystemPromptWithEventContexts("base", list);
    expect(result).toContain("base\n\n<known_event_contexts>");
    expect(result).toContain(KNOWN_EVENT_CONTEXTS_HEADER);
    expect(result).toContain(JSON.stringify(list[0]));
    expect(result).toMatch(/<\/known_event_contexts>$/);
  });

  test("emits only the block when base prompt is undefined", () => {
    const list = appendUniqueEventContext([], dashboardCtx, fixedNow);
    const result = composeSystemPromptWithEventContexts(undefined, list);
    expect(result).toMatch(/^<known_event_contexts>/);
    expect(result).toMatch(/<\/known_event_contexts>$/);
  });

  test("emits one JSON line per context", () => {
    let list = appendUniqueEventContext([], discordCtx, fixedNow);
    list = appendUniqueEventContext(list, githubIssueCommentCtx, fixedNow);
    const result = composeSystemPromptWithEventContexts(undefined, list);
    expect(result).toContain(JSON.stringify(list[0]));
    expect(result).toContain(JSON.stringify(list[1]));
  });
});
