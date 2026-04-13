import { describe, expect, test } from "bun:test";
import { Naming } from "./chimp.ts";

describe("Naming.parseInputSubject", () => {
  test("parses valid input subject", () => {
    expect(Naming.parseInputSubject("chimps.inputs.chimp-123")).toBe(
      "chimp-123",
    );
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
  test("parses valid output subject", () => {
    expect(Naming.parseOutputSubject("chimps.outputs.chimp-abc")).toBe(
      "chimp-abc",
    );
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
  test("inputSubject roundtrip", () => {
    const chimpId = "test-chimp-001";
    const subject = Naming.inputSubject(chimpId);
    expect(Naming.parseInputSubject(subject)).toBe(chimpId);
  });

  test("outputSubject roundtrip", () => {
    const chimpId = "test-chimp-002";
    const subject = Naming.outputSubject(chimpId);
    expect(Naming.parseOutputSubject(subject)).toBe(chimpId);
  });
});
