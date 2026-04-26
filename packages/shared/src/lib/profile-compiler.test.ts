import { describe, expect, test } from "bun:test";
import { compileProfiles, type ProfileTemplate } from "./profile-compiler";

const template: ProfileTemplate = {
  base: {
    image: "chimp",
    extraEnv: [
      { name: "TOKEN", value: "base-token" },
      { name: "SHARED", value: "shared-val" },
    ],
    initCommands: [
      { command: "setup-github-auth" },
      {
        command: "set-system-prompt",
        args: { prompt: "base prompt" },
      },
    ],
    auth: {
      anthropic: { source: "env", envVar: "ANTHROPIC_API_KEY" },
    },
  },
  profiles: {
    scout: {
      brain: "claude",
      provider: "anthropic",
      model: "haiku",
      description: "Fast triage",
      initCommands: [
        {
          command: "append-system-prompt",
          args: { prompt: "You are a scout." },
        },
      ],
    },
    worker: {
      brain: "claude",
      provider: "anthropic",
      model: "sonnet",
      description: "General worker",
      extraEnv: [{ name: "TOKEN", value: "worker-token" }],
      image: "chimp-custom",
      auth: {
        openai: { source: "env", envVar: "OPENAI_API_KEY" },
      },
    },
  },
};

describe("compileProfiles", () => {
  const compiled = compileProfiles(template);

  test("compiles all profiles", () => {
    expect(Object.keys(compiled)).toEqual(["scout", "worker"]);
  });

  test("inherits base image", () => {
    expect(compiled.scout?.image).toBe("chimp");
  });

  test("variant overrides image", () => {
    expect(compiled.worker?.image).toBe("chimp-custom");
  });

  test("concatenates initCommands: base then variant", () => {
    const cmds = compiled.scout?.initCommands ?? [];
    expect(cmds.length).toBe(3);
    expect(cmds[0]?.command).toBe("setup-github-auth");
    expect(cmds[1]?.command).toBe("set-system-prompt");
    expect(cmds[2]?.command).toBe("append-system-prompt");
  });

  test("base-only profile gets base initCommands", () => {
    const cmds = compiled.worker?.initCommands ?? [];
    expect(cmds.length).toBe(2);
    expect(cmds[0]?.command).toBe("setup-github-auth");
  });

  test("merges extraEnv: variant overrides by name", () => {
    const env = compiled.worker?.extraEnv ?? [];
    const token = env.find((e) => e.name === "TOKEN");
    const shared = env.find((e) => e.name === "SHARED");
    expect(token?.value).toBe("worker-token");
    expect(shared?.value).toBe("shared-val");
  });

  test("base extraEnv preserved when no variant override", () => {
    const env = compiled.scout?.extraEnv ?? [];
    expect(env.length).toBe(2);
    expect(env.find((e) => e.name === "TOKEN")?.value).toBe("base-token");
  });

  test("sets brain, model, description from variant", () => {
    expect(compiled.scout?.brain).toBe("claude");
    expect(compiled.scout?.model).toBe("haiku");
    expect(compiled.scout?.description).toBe("Fast triage");
  });

  test("inherits base auth when no variant override", () => {
    expect(compiled.scout?.auth).toEqual({
      anthropic: { source: "env", envVar: "ANTHROPIC_API_KEY" },
    });
  });

  test("merges auth: variant overrides by provider name", () => {
    expect(compiled.worker?.auth).toEqual({
      anthropic: { source: "env", envVar: "ANTHROPIC_API_KEY" },
      openai: { source: "env", envVar: "OPENAI_API_KEY" },
    });
  });
});
