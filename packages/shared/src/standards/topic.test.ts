import { describe, expect, test } from "bun:test";
import {
  eventSubjectToTopic,
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
