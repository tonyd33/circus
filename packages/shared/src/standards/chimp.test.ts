import { describe, expect, test } from "bun:test";
import { Naming } from "./chimp.ts";

describe("Naming.parseInputSubject", () => {
  test("parses valid old format input subject", () => {
    const result = Naming.parseInputSubject("chimps.inputs.chimp-123");
    expect(result).toEqual({ profile: "", chimpId: "chimp-123" });
  });

  test("parses new format input subject with profile", () => {
    const result = Naming.parseInputSubject("chimp.inputs.default.chimp-123");
    expect(result).toEqual({ profile: "default", chimpId: "chimp-123" });
  });

  test("returns null for non-input subject", () => {
    expect(Naming.parseInputSubject("chimps.outputs.chimp-123")).toBeNull();
    expect(Naming.parseInputSubject("other.prefix.chimp-123")).toBeNull();
  });

  test("returns null for subject without chimpId", () => {
    expect(Naming.parseInputSubject("chimps.inputs")).toBeNull();
    expect(Naming.parseInputSubject("chimps.inputs.")).toBeNull();
  });
});

describe("Naming.parseOutputSubject", () => {
  test("parses old format output subject", () => {
    const result = Naming.parseOutputSubject("chimps.outputs.chimp-abc");
    expect(result).toEqual({ profile: "", chimpId: "chimp-abc" });
  });

  test("parses new format output subject with profile", () => {
    const result = Naming.parseOutputSubject("chimp.outputs.default.chimp-abc");
    expect(result).toEqual({ profile: "default", chimpId: "chimp-abc" });
  });

  test("returns null for non-output subject", () => {
    expect(Naming.parseOutputSubject("chimps.inputs.chimp-123")).toBeNull();
    expect(Naming.parseOutputSubject("other.prefix.chimp-123")).toBeNull();
  });

  test("returns null for subject without chimpId", () => {
    expect(Naming.parseOutputSubject("chimps.outputs")).toBeNull();
    expect(Naming.parseOutputSubject("chimps.outputs.")).toBeNull();
  });
});

describe("Naming - roundtrip", () => {
  test("inputSubject roundtrip (old format)", () => {
    const chimpId = "test-chimp-001";
    const subject = Naming.inputSubject(chimpId);
    expect(Naming.parseInputSubject(subject)).toEqual({
      profile: "",
      chimpId,
    });
  });

  test("inputSubject roundtrip (new format)", () => {
    const profile = "default";
    const chimpId = "test-chimp-001";
    const subject = `chimp.inputs.${profile}.${chimpId}`;
    expect(Naming.parseInputSubject(subject)).toEqual({
      profile,
      chimpId,
    });
  });

  test("outputSubject roundtrip", () => {
    const chimpId = "test-chimp-002";
    const subject = Naming.outputSubject(chimpId);
    expect(Naming.parseOutputSubject(subject)).toEqual({
      profile: "",
      chimpId: chimpId,
    });
  });
});
