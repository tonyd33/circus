import { describe, expect, test } from "bun:test";
import { expandChimpRequest } from "./expand-chimp-request";

const T = new Date("2026-04-22T00:00:00.000Z");

describe(expandChimpRequest, () => {
  test("expands chimp-request into 4 orchestration actions", () => {
    const actions = expandChimpRequest(
      {
        type: "chimp-request",
        chimpId: "new-chimp",
        profile: "worker",
      },
      T,
    );

    expect(actions).toEqual([
      {
        type: "set-profile",
        chimpId: "new-chimp",
        profile: "worker",
      },
      {
        type: "subscribe-topic",
        chimpId: "new-chimp",
        topic: { platform: "direct", chimpId: "new-chimp" },
      },
      {
        type: "ensure-consumers",
        chimpId: "new-chimp",
        deliverFrom: { type: "time", value: T },
      },
      {
        type: "ensure-job",
        chimpId: "new-chimp",
      },
    ]);
  });

  test("preserves chimpId across all actions", () => {
    const actions = expandChimpRequest(
      {
        type: "chimp-request",
        chimpId: "abc-123",
        profile: "p",
      },
      T,
    );

    for (const action of actions) {
      expect(action.chimpId).toBe("abc-123");
    }
  });
});
