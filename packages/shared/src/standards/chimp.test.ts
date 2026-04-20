import { describe, expect, test } from "bun:test";
import { Naming } from "./chimp.ts";

describe("Naming.commandSubject", () => {
  test("builds command subject", () => {
    expect(Naming.commandSubject("chimp-123")).toBe("commands.chimp-123");
  });
});

describe("Naming.outputSubject", () => {
  test("builds output subject", () => {
    expect(Naming.outputSubject("chimp-abc")).toBe("outputs.chimp-abc");
  });
});

describe("Naming.metaSubject", () => {
  test("builds meta subject", () => {
    expect(Naming.metaSubject("chimp-xyz")).toBe("meta.chimp-xyz");
  });
});

describe("Naming.consumerNames", () => {
  test("event consumer name", () => {
    expect(Naming.eventConsumerName("abc")).toBe("chimp-abc");
  });

  test("command consumer name", () => {
    expect(Naming.commandConsumerName("abc")).toBe("chimp-abc-commands");
  });
});

describe("Naming.streamNames", () => {
  test("stream names", () => {
    expect(Naming.eventsStreamName()).toBe("events");
    expect(Naming.commandsStreamName()).toBe("commands");
    expect(Naming.outputsStreamName()).toBe("outputs");
  });
});
