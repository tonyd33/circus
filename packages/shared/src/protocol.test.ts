import { describe, expect, test } from "bun:test";
import {
  ChimpOutputMessageSchema,
  createDiscordResponse,
  createGithubComment,
  DiscordResponseSchema,
  GithubCommentSchema,
} from "./protocol.ts";

describe("createDiscordResponse", () => {
  test("builds a discord-response message with all fields", () => {
    const msg = createDiscordResponse({
      interactionToken: "tok-abc",
      applicationId: "app-123",
      content: "hello world",
    });

    expect(msg).toEqual({
      type: "discord-response",
      interactionToken: "tok-abc",
      applicationId: "app-123",
      content: "hello world",
    });
  });

  test("result validates against DiscordResponseSchema", () => {
    const msg = createDiscordResponse({
      interactionToken: "tok",
      applicationId: "app",
      content: "c",
    });
    expect(DiscordResponseSchema.safeParse(msg).success).toBe(true);
  });

  test("result validates against ChimpOutputMessageSchema (discriminated union)", () => {
    const msg = createDiscordResponse({
      interactionToken: "tok",
      applicationId: "app",
      content: "c",
    });
    expect(ChimpOutputMessageSchema.safeParse(msg).success).toBe(true);
  });
});

describe("createGithubComment", () => {
  test("builds a github-comment message with all fields", () => {
    const msg = createGithubComment({
      installationId: 42,
      repo: "tonyd33/circus",
      issueNumber: 57,
      content: "LGTM",
    });

    expect(msg).toEqual({
      type: "github-comment",
      installationId: 42,
      repo: "tonyd33/circus",
      issueNumber: 57,
      content: "LGTM",
    });
  });

  test("result validates against GithubCommentSchema", () => {
    const msg = createGithubComment({
      installationId: 1,
      repo: "x/y",
      issueNumber: 2,
      content: "hi",
    });
    expect(GithubCommentSchema.safeParse(msg).success).toBe(true);
  });

  test("result validates against ChimpOutputMessageSchema (discriminated union)", () => {
    const msg = createGithubComment({
      installationId: 1,
      repo: "x/y",
      issueNumber: 2,
      content: "hi",
    });
    expect(ChimpOutputMessageSchema.safeParse(msg).success).toBe(true);
  });
});
