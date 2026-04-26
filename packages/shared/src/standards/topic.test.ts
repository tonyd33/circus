import { describe, expect, test } from "bun:test";
import {
  eventSubjectToTopic,
  parseEventSubject,
  serializeTopic,
  topicToEventSubject,
} from "./topic.ts";

describe("serializeTopic", () => {
  test("serializes github PR topic", () => {
    expect(
      serializeTopic({
        platform: "github",
        owner: "tonyd33",
        repo: "circus",
        type: "pr",
        number: 42,
      }),
    ).toBe("github.tonyd33.circus.pr.42");
  });

  test("serializes github issue topic", () => {
    expect(
      serializeTopic({
        platform: "github",
        owner: "acme",
        repo: "app",
        type: "issue",
        number: 7,
      }),
    ).toBe("github.acme.app.issue.7");
  });
});

describe("topicToEventSubject", () => {
  test("converts topic to wildcard event subject", () => {
    expect(
      topicToEventSubject({
        platform: "github",
        owner: "tonyd33",
        repo: "circus",
        type: "pr",
        number: 42,
      }),
    ).toBe("events.github.tonyd33.circus.pr.42.>");
  });
});

describe("eventSubjectToTopic", () => {
  test("parses github PR event subject", () => {
    expect(
      eventSubjectToTopic("events.github.tonyd33.circus.pr.42.comment"),
    ).toEqual({
      platform: "github",
      owner: "tonyd33",
      repo: "circus",
      type: "pr",
      number: 42,
    });
  });

  test("parses github issue event subject", () => {
    expect(
      eventSubjectToTopic("events.github.acme.app.issue.7.opened"),
    ).toEqual({
      platform: "github",
      owner: "acme",
      repo: "app",
      type: "issue",
      number: 7,
    });
  });

  test("returns null for non-event subject", () => {
    expect(eventSubjectToTopic("commands.chimp-123")).toBeNull();
  });

  test("returns null for unknown platform", () => {
    expect(eventSubjectToTopic("events.slack.team.channel.message")).toBeNull();
  });

  test("returns null for incomplete github subject", () => {
    expect(eventSubjectToTopic("events.github.tonyd33")).toBeNull();
  });
});

describe("parseEventSubject", () => {
  test("parses valid event subject", () => {
    expect(
      parseEventSubject("events.github.tonyd33.circus.pr.42.comment"),
    ).toBe("github.tonyd33.circus.pr.42.comment");
  });

  test("parses direct event subject", () => {
    expect(parseEventSubject("events.direct.chimp-123")).toBe(
      "direct.chimp-123",
    );
  });

  test("returns null for empty subject", () => {
    expect(parseEventSubject("")).toBeNull();
  });

  test("returns null for subject missing events prefix", () => {
    expect(parseEventSubject("commands.chimp-123")).toBeNull();
  });

  test("returns null for malformed subject (no dot after prefix)", () => {
    expect(parseEventSubject("events")).toBeNull();
  });

  test("returns null for malformed subject (only prefix)", () => {
    expect(parseEventSubject("events.")).toBe("");
  });

  test("handles discord platform", () => {
    expect(
      parseEventSubject(
        "events.discord.guild123.channel456.interaction789.created",
      ),
    ).toBe("discord.guild123.channel456.interaction789.created");
  });
});
