import { describe, expect, test } from "bun:test";
import { Naming } from "./chimp.ts";

describe("Naming.parseInputSubject", () => {
  test("parses valid input subject", () => {
    const result = Naming.parseInputSubject("chimp.inputs.default.chimp-123");
    expect(result).toEqual({ profile: "default", chimpId: "chimp-123" });
  });

  test("returns null for non-input subject", () => {
    expect(
      Naming.parseInputSubject("chimp.outputs.default.chimp-123"),
    ).toBeNull();
    expect(Naming.parseInputSubject("other.prefix.chimp-123")).toBeNull();
  });

  test("returns null for subject without profile or chimpId", () => {
    expect(Naming.parseInputSubject("chimp.inputs")).toBeNull();
    expect(Naming.parseInputSubject("chimp.inputs.")).toBeNull();
    expect(Naming.parseInputSubject("chimp.inputs.default")).toBeNull();
  });
});

describe("Naming.parseOutputSubject", () => {
  test("parses valid output subject", () => {
    const result = Naming.parseOutputSubject("chimp.outputs.fast.chimp-abc");
    expect(result).toEqual({ profile: "fast", chimpId: "chimp-abc" });
  });

  test("returns null for non-output subject", () => {
    expect(
      Naming.parseOutputSubject("chimp.inputs.default.chimp-123"),
    ).toBeNull();
    expect(Naming.parseOutputSubject("other.prefix.chimp-123")).toBeNull();
  });

  test("returns null for subject without profile or chimpId", () => {
    expect(Naming.parseOutputSubject("chimp.outputs")).toBeNull();
    expect(Naming.parseOutputSubject("chimp.outputs.")).toBeNull();
    expect(Naming.parseOutputSubject("chimp.outputs.default")).toBeNull();
  });
});

describe("Naming - roundtrip", () => {
  test("inputSubject roundtrip", () => {
    const profile = "default";
    const chimpId = "test-chimp-001";
    const subject = Naming.inputSubject(profile, chimpId);
    expect(subject).toBe("chimp.inputs.default.test-chimp-001");
    expect(Naming.parseInputSubject(subject)).toEqual({ profile, chimpId });
  });

  test("outputSubject roundtrip", () => {
    const profile = "fast";
    const chimpId = "test-chimp-002";
    const subject = Naming.outputSubject(profile, chimpId);
    expect(subject).toBe("chimp.outputs.fast.test-chimp-002");
    expect(Naming.parseOutputSubject(subject)).toEqual({ profile, chimpId });
  });
});
