import { describe, expect, test } from "bun:test";

import { parseKeyValueForKey, parseKeyValueObjectForKeys } from "./parsers";

describe(parseKeyValueForKey, () => {
  test("parses key=value", () => {
    const p = parseKeyValueForKey("adapter");
    const result = p.parse("adapter=/usr/bin");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual({ key: "adapter", value: "/usr/bin" });
  });

  test("fails on wrong key", () => {
    const p = parseKeyValueForKey("adapter");
    const result = p.parse("path=/somewhere");
    expect(result.isLeft()).toBe(true);
  });

  test("fails on missing equals", () => {
    const p = parseKeyValueForKey("adapter");
    const result = p.parse("adapter");
    expect(result.isLeft()).toBe(true);
  });

  test("fails on empty value", () => {
    const p = parseKeyValueForKey("adapter");
    const result = p.parse("adapter=");
    expect(result.isLeft()).toBe(true);
  });
});

describe(parseKeyValueObjectForKeys, () => {
  test("parses multiple key-value pairs", () => {
    const p = parseKeyValueObjectForKeys(["adapter", "path"] as const);
    const result = p.parse("adapter=/bin/sh,path=/app");
    expect(result.unwrap()).toEqual({ adapter: "/bin/sh", path: "/app" });
  });

  test("fails on missing required key", () => {
    const p = parseKeyValueObjectForKeys(["adapter", "path"] as const);
    const result = p.parse("adapter=/bin/sh");
    expect(result.isLeft()).toBe(true);
  });

  test("fails on extra keys not in schema", () => {
    const p = parseKeyValueObjectForKeys(["adapter"] as const);
    const result = p.parse("adapter=/bin/sh,extra=value");
    expect(result.unwrap()).toEqual({ adapter: "/bin/sh" });
  });

  test("parses empty string", () => {
    const p = parseKeyValueObjectForKeys(["adapter", "path"] as const);
    const result = p.parse("");
    expect(result.isLeft()).toBe(true);
  });
});
