import { z } from "zod";
import * as P from "../lib/parser/string";

export const TopicSchema = z.discriminatedUnion("platform", [
  z.object({
    platform: z.literal("github"),
    owner: z.string(),
    repo: z.string(),
    type: z.enum(["pr", "issue"]),
    number: z.number(),
  }),
  z.object({
    platform: z.literal("discord"),
    guildId: z.string(),
    channelId: z.string(),
    interactionId: z.string(),
  }),
  z.object({
    platform: z.literal("direct"),
    chimpId: z.string(),
  }),
  z.object({
    platform: z.literal("debug"),
    sessionId: z.string(),
  }),
]);

export type Topic = z.infer<typeof TopicSchema>;

export interface TopicSubscription {
  chimpId: string;
  subscribedAt: string;
}

export function serializeTopic(topic: Topic): string {
  switch (topic.platform) {
    case "github":
      return `github.${topic.owner}.${topic.repo}.${topic.type}.${topic.number}`;
    case "discord":
      return `discord.${topic.guildId}.${topic.channelId}.${topic.interactionId}`;
    case "direct":
      return `direct.${topic.chimpId}`;
    case "debug":
      return `debug.${topic.sessionId}`;
  }
}

export function topicToEventSubject(topic: Topic): string {
  return `events.${serializeTopic(topic)}.>`;
}

export function buildEventSubject(topic: Topic, action: string): string {
  return `events.${serializeTopic(topic)}.${action}`;
}

const dot = P.grapheme(".");
const segment = P.flat(P.many1(P.noneOf(".")));
const digits = P.flat(P.many1(P.oneOf("0123456789")));
const prOrIssue = P.choice([P.strLit("pr"), P.strLit("issue")]);

const githubTopicParser = P.Do()
  .do(P.str("events."))
  .do(P.str("github"))
  .do(dot)
  .bind("owner", segment)
  .do(dot)
  .bind("repo", segment)
  .do(dot)
  .bind("type", prOrIssue)
  .do(dot)
  .bind("number", digits)
  .return(
    (env): Topic => ({
      platform: "github",
      owner: env.owner,
      repo: env.repo,
      type: env.type,
      number: Number(env.number),
    }),
  );

const discordTopicParser = P.Do()
  .do(P.str("events."))
  .do(P.str("discord"))
  .do(dot)
  .bind("guildId", segment)
  .do(dot)
  .bind("channelId", segment)
  .do(dot)
  .bind("interactionId", segment)
  .return(
    (env): Topic => ({
      platform: "discord",
      guildId: env.guildId,
      channelId: env.channelId,
      interactionId: env.interactionId,
    }),
  );

const directTopicParser = P.Do()
  .do(P.str("events."))
  .do(P.str("direct"))
  .do(dot)
  .bind("chimpId", segment)
  .return(
    (env): Topic => ({
      platform: "direct",
      chimpId: env.chimpId,
    }),
  );

const debugTopicParser = P.Do()
  .do(P.str("events."))
  .do(P.str("debug"))
  .do(dot)
  .bind("sessionId", segment)
  .return(
    (env): Topic => ({
      platform: "debug",
      sessionId: env.sessionId,
    }),
  );

const eventSubjectParser = P.choice([
  githubTopicParser,
  discordTopicParser,
  directTopicParser,
  debugTopicParser,
]);

export function eventSubjectToTopic(subject: string): Topic | null {
  return eventSubjectParser.parse(subject).unwrapOr(null);
}

const githubKeyParser = P.Do()
  .do(P.str("github"))
  .do(dot)
  .bind("owner", segment)
  .do(dot)
  .bind("repo", segment)
  .do(dot)
  .bind("type", prOrIssue)
  .do(dot)
  .bind("number", digits)
  .return(
    (env): Topic => ({
      platform: "github",
      owner: env.owner,
      repo: env.repo,
      type: env.type,
      number: Number(env.number),
    }),
  );

const discordKeyParser = P.Do()
  .do(P.str("discord"))
  .do(dot)
  .bind("guildId", segment)
  .do(dot)
  .bind("channelId", segment)
  .do(dot)
  .bind("interactionId", segment)
  .return(
    (env): Topic => ({
      platform: "discord",
      guildId: env.guildId,
      channelId: env.channelId,
      interactionId: env.interactionId,
    }),
  );

const directKeyParser = P.Do()
  .do(P.str("direct"))
  .do(dot)
  .bind("chimpId", segment)
  .return(
    (env): Topic => ({
      platform: "direct",
      chimpId: env.chimpId,
    }),
  );

const debugKeyParser = P.Do()
  .do(P.str("debug"))
  .do(dot)
  .bind("sessionId", segment)
  .return(
    (env): Topic => ({
      platform: "debug",
      sessionId: env.sessionId,
    }),
  );

const topicKeyParser = P.choice([
  githubKeyParser,
  discordKeyParser,
  directKeyParser,
  debugKeyParser,
]);

export function deserializeTopic(key: string): Topic | null {
  return topicKeyParser.parse(key).unwrapOr(null);
}
