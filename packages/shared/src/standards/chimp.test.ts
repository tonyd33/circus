import { describe, expect, test } from "bun:test";
import { Naming } from "./chimp.ts";

describe("Naming.directSubject", () => {
  test("builds direct subject", () => {
    expect(Naming.directSubject("chimp-123")).toBe(
      "events.direct.chimp-123.command",
    );
  });
});

describe("Naming.outputSubject", () => {
  test("builds output subject", () => {
    expect(Naming.outputSubject("chimp-abc")).toBe("outputs.chimp-abc");
  });
});

describe("Naming.lifecycleSubject", () => {
  test("builds lifecycle subject", () => {
    expect(Naming.lifecycleSubject("chimp-xyz")).toBe(
      "meta.lifecycle.chimp-xyz",
    );
  });
  test("lifecycle filter", () => {
    expect(Naming.lifecycleFilter()).toBe("meta.lifecycle.>");
  });
});

describe("Naming.orchestration", () => {
  test("orchestration subject", () => {
    expect(Naming.orchestrationSubject("set-profile", "chimp-1")).toBe(
      "meta.orchestration.set-profile.chimp-1",
    );
  });
  test("orchestration filter", () => {
    expect(Naming.orchestrationFilter()).toBe("meta.orchestration.>");
  });
  test("orchestration stream name", () => {
    expect(Naming.orchestrationStreamName()).toBe("orchestration");
  });
});

describe("Naming.consumerNames", () => {
  test("event consumer name", () => {
    expect(Naming.eventConsumerName("abc")).toBe("chimp-abc");
  });
  test("orchestration consumer name", () => {
    expect(Naming.orchestrationConsumerName()).toBe("ringmaster-orchestration");
  });
});

describe("Naming.streamNames", () => {
  test("stream names", () => {
    expect(Naming.eventsStreamName()).toBe("events");
    expect(Naming.outputsStreamName()).toBe("outputs");
  });
});
