import { describe, expect, test } from "bun:test";

import * as Parser from "./parser";

describe(Parser.predicate, () => {
  test("parses matching grapheme", () => {
    const p = Parser.predicate((g) => g === "a", "a");
    const result = p.parse("abc");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual(["bc", "a"]);
  });

  test("returns error on mismatch", () => {
    const p = Parser.predicate((g) => g === "a", "a");
    const result = p.parse("bcd");
    expect(result.isLeft()).toBe(true);
  });

  test("returns eof error on empty input", () => {
    const p = Parser.predicate((g) => g === "a", "a");
    const result = p.parse("");
    expect(result.isLeft()).toBe(true);
    expect(result.unwrap()).toEqual({ type: "eof" });
  });
});

describe(Parser.grapheme, () => {
  test("parses exact grapheme", () => {
    const p = Parser.grapheme("x");
    const result = p.parse("xyz");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual(["yz", "x"]);
  });

  test("fails on mismatch", () => {
    const p = Parser.grapheme("x");
    const result = p.parse("yzx");
    expect(result.isLeft()).toBe(true);
  });
});

describe(Parser.oneOf, () => {
  test("parses one of chars", () => {
    const p = Parser.oneOf("abc");
    const result = p.parse("bcd");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual(["cd", "b"]);
  });

  test("fails on none match", () => {
    const p = Parser.oneOf("abc");
    const result = p.parse("xyz");
    expect(result.isLeft()).toBe(true);
  });
});

describe(Parser.noneOf, () => {
  test("parses char not in set", () => {
    const p = Parser.noneOf("abc");
    const result = p.parse("def");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual(["ef", "d"]);
  });

  test("fails on char in set", () => {
    const p = Parser.noneOf("abc");
    const result = p.parse("bcd");
    expect(result.isLeft()).toBe(true);
  });
});

describe(Parser.any, () => {
  test("parses any grapheme", () => {
    const p = Parser.any();
    const result = p.parse("abc");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual(["bc", "a"]);
  });

  test("fails on eof", () => {
    const p = Parser.any();
    const result = p.parse("");
    expect(result.isLeft()).toBe(true);
  });
});

describe(Parser.str, () => {
  test("parses exact string", () => {
    const p = Parser.str("hello");
    const result = p.parse("hello world");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual([" world", "hello"]);
  });

  test("fails on mismatch", () => {
    const p = Parser.str("hello");
    const result = p.parse("world");
    expect(result.isLeft()).toBe(true);
  });
});

describe(Parser.many, () => {
  test("parses zero or more", () => {
    const p = Parser.many(Parser.grapheme("a"));
    const result = p.parse("aaab");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual(["b", ["a", "a", "a"]]);
  });

  test("returns empty on no match", () => {
    const p = Parser.many(Parser.grapheme("a"));
    const result = p.parse("bbb");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual(["bbb", []]);
  });

  test("returns empty on empty input", () => {
    const p = Parser.many(Parser.grapheme("a"));
    const result = p.parse("");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual(["", []]);
  });
});

describe(Parser.many1, () => {
  test("parses one or more", () => {
    const p = Parser.many1(Parser.grapheme("a"));
    const result = p.parse("aaab");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual(["b", ["a", "a", "a"]]);
  });

  test("fails on no match", () => {
    const p = Parser.many1(Parser.grapheme("a"));
    const result = p.parse("bbb");
    expect(result.isLeft()).toBe(true);
  });
});

describe(Parser.sepBy, () => {
  test("parses comma-separated values", () => {
    const p = Parser.sepBy(
      Parser.many1(Parser.oneOf("abc")),
      Parser.grapheme(","),
    );
    const result = p.parse("a,b,c");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual(["", [["a"], ["b"], ["c"]]]);
  });

  test("returns empty on no match", () => {
    const p = Parser.sepBy(
      Parser.many1(Parser.oneOf("abc")),
      Parser.grapheme(","),
    );
    const result = p.parse("xyz");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual(["xyz", []]);
  });

  test("handles trailing separator", () => {
    const p = Parser.sepBy(
      Parser.many1(Parser.oneOf("abc")),
      Parser.grapheme(","),
    );
    const result = p.parse("a,b,");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual([",", [["a"], ["b"]]]);
  });
});

describe(Parser.sepBy1, () => {
  test("parses one or more separated values", () => {
    const p = Parser.sepBy1(
      Parser.many1(Parser.oneOf("abc")),
      Parser.grapheme(","),
    );
    const result = p.parse("a,b,c");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual(["", [["a"], ["b"], ["c"]]]);
  });

  test("fails on no match", () => {
    const p = Parser.sepBy1(
      Parser.many1(Parser.oneOf("abc")),
      Parser.grapheme(","),
    );
    const result = p.parse("xyz");
    expect(result.isLeft()).toBe(true);
  });
});

describe(Parser.option, () => {
  test("returns parsed value", () => {
    const p = Parser.option("default", Parser.str("hello"));
    const result = p.parse("hello world");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual([" world", "hello"]);
  });

  test("returns default on failure", () => {
    const p = Parser.option("default", Parser.str("hello"));
    const result = p.parse("world");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual(["world", "default"]);
  });
});

describe(Parser.optional, () => {
  test("returns void on match", () => {
    const p = Parser.optional(Parser.str("hello"));
    const result = p.parse("hello world");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual([" world", undefined]);
  });

  test("returns void on failure", () => {
    const p = Parser.optional(Parser.str("hello"));
    const result = p.parse("world");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual(["world", undefined]);
  });
});

describe(Parser.flat, () => {
  test("flattens Parser<string[]> to Parser<string>", () => {
    const p = Parser.flat(Parser.many1(Parser.oneOf("abc")));
    const result = p.parse("abc");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual(["", "abc"]);
  });

  test("returns empty string for empty array", () => {
    const p = Parser.flat(Parser.many(Parser.grapheme("x")));
    const result = p.parse("abc");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual(["abc", ""]);
  });
});

describe(Parser.between, () => {
  test("parses content between delimiters", () => {
    const p = Parser.between(
      Parser.str("("),
      Parser.many1(Parser.oneOf("abc")),
      Parser.str(")"),
    );
    const result = p.parse("(abc)");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual(["", ["a", "b", "c"]]);
  });

  test("fails when open missing", () => {
    const p = Parser.between(
      Parser.str("("),
      Parser.many1(Parser.oneOf("abc")),
      Parser.str(")"),
    );
    const result = p.parse("abc)");
    expect(result.isLeft()).toBe(true);
  });

  test("fails when close missing", () => {
    const p = Parser.between(
      Parser.str("("),
      Parser.many1(Parser.oneOf("abc")),
      Parser.str(")"),
    );
    const result = p.parse("(abc");
    expect(result.isLeft()).toBe(true);
  });
});

describe(Parser.choice, () => {
  test("returns first successful parse", () => {
    const p = Parser.choice([
      Parser.str("hello"),
      Parser.str("world"),
      Parser.str("foo"),
    ]);
    const result = p.parse("world");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual(["", "world"]);
  });

  test("tries all until one matches", () => {
    const p = Parser.choice([Parser.str("foo"), Parser.str("bar")]);
    const result = p.parse("bar");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual(["", "bar"]);
  });

  test("fails when none match", () => {
    const p = Parser.choice([Parser.str("hello"), Parser.str("world")]);
    const result = p.parse("foo");
    expect(result.isLeft()).toBe(true);
  });
});

describe(Parser.Do, () => {
  test("do() chains parser, discards result", () => {
    const p = Parser.Do()
      .do(Parser.str("a"))
      .do(Parser.str("b"))
      .return((env) => env);
    const result = p.parse("ab");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual(["", {}]);
  });

  test("bind() adds variable to environment", () => {
    const p = Parser.Do()
      .bind("x", Parser.str("hello"))
      .return((env) => env.x);
    const result = p.parse("hello");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual(["", "hello"]);
  });

  test("bind() chains multiple variables", () => {
    const p = Parser.Do()
      .bind("first", Parser.str("a"))
      .bind("second", Parser.str("b"))
      .return((env) => env.first + env.second);
    const result = p.parse("ab");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual(["", "ab"]);
  });

  test("bindL() creates parser from environment", () => {
    const p = Parser.Do()
      .bind("sep", Parser.str(","))
      .bindL("rest", (env) => Parser.many(Parser.oneOf("abc")))
      .return((env) => env.rest.join(env.sep));
    const result = p.parse(",abc");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual(["", "a,b,c"]);
  });

  test("return() extracts final value", () => {
    const p = Parser.Do()
      .bind("a", Parser.str("x"))
      .return((env) => env.a);
    const result = p.parse("x");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual(["", "x"]);
  });

  test("fails on parse error in chain", () => {
    const p = Parser.Do()
      .bind("a", Parser.str("hello"))
      .return((env) => env.a);
    const result = p.parse("world");
    expect(result.isLeft()).toBe(true);
  });

  test("do() can inject side-effects in chain", () => {
    const p = Parser.Do()
      .bind("a", Parser.str("a"))
      .do(Parser.str("b"))
      .bind("c", Parser.str("c"))
      .return((env) => env.a + env.c);
    const result = p.parse("abc");
    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual(["", "ac"]);
  });
});
