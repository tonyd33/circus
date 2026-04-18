import { describe, expect, test } from "bun:test";

import * as ER from "./env-reader";

describe(ER.str, () => {
  test("reads existing string value", () => {
    const env = { FOO: "bar" };
    const reader = ER.str("FOO");
    const result = reader.read(env);

    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toBe("bar");
  });

  test("returns error for missing key", () => {
    const env = {};
    const reader = ER.str("FOO");
    const result = reader.read(env);

    expect(result.isLeft()).toBe(true);
    expect(result.unwrap()).toEqual({ type: "not_found", key: "FOO" });
  });

  test("returns error for undefined value", () => {
    const env = { FOO: undefined };
    const reader = ER.str("FOO");
    const result = reader.read(env);

    expect(result.isLeft()).toBe(true);
  });

  test("reads empty string value", () => {
    const env = { FOO: "" };
    const reader = ER.str("FOO");
    const result = reader.read(env);

    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toBe("");
  });
});

describe(ER.int, () => {
  test("reads valid integer", () => {
    const env = { PORT: "8080" };
    const reader = ER.int("PORT");
    const result = reader.read(env);

    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toBe(8080);
  });

  test("reads negative integer", () => {
    const env = { NUM: "-42" };
    const reader = ER.int("NUM");
    const result = reader.read(env);

    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toBe(-42);
  });

  test("reads zero", () => {
    const env = { NUM: "0" };
    const reader = ER.int("NUM");
    const result = reader.read(env);

    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toBe(0);
  });

  test("returns error for missing key", () => {
    const env = {};
    const reader = ER.int("PORT");
    const result = reader.read(env);

    expect(result.isLeft()).toBe(true);
    expect(result.unwrap()).toEqual({ type: "not_found", key: "PORT" });
  });

  test("returns validation error for non-numeric string", () => {
    const env = { PORT: "abc" };
    const reader = ER.int("PORT");
    const result = reader.read(env);

    expect(result.isLeft()).toBe(true);
    expect(result.unwrap()).toEqual({
      type: "invalid",
      key: "PORT",
      why: "Not a number",
    });
  });

  test("returns validation error for float string", () => {
    const env = { PORT: "8080.5" };
    const reader = ER.int("PORT");
    const result = reader.read(env);

    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toBe(8080);
  });

  test("returns validation error for empty string", () => {
    const env = { PORT: "" };
    const reader = ER.int("PORT");
    const result = reader.read(env);

    expect(result.isLeft()).toBe(true);
    expect(result.unwrap()).toEqual({
      type: "invalid",
      key: "PORT",
      why: "Not a number",
    });
  });
});

describe(ER.enm, () => {
  test("reads valid enum value", () => {
    const env = { MODE: "fast" };
    const reader = ER.enm("MODE", ["fast", "slow", "normal"]);
    const result = reader.read(env);

    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toBe("fast");
  });

  test("returns error for missing key", () => {
    const env = {};
    const reader = ER.enm("MODE", ["fast", "slow"]);
    const result = reader.read(env);

    expect(result.isLeft()).toBe(true);
    expect(result.unwrap()).toEqual({ type: "not_found", key: "MODE" });
  });

  test("returns validation error for invalid value", () => {
    const env = { MODE: "turbo" };
    const reader = ER.enm("MODE", ["fast", "slow"]);
    const result = reader.read(env);

    expect(result.isLeft()).toBe(true);
    expect(result.unwrap()).toEqual({
      type: "invalid",
      key: "MODE",
      why: "Must be one of: fast, slow",
    });
  });

  test("works with fallback", () => {
    const env = {};
    const reader = ER.enm("MODE", ["fast", "slow"]).fallback("slow");
    const result = reader.read(env);

    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toBe("slow");
  });

  test("fallback on invalid value", () => {
    const env = { MODE: "turbo" };
    const reader = ER.enm("MODE", ["fast", "slow"]).fallback("slow");
    const result = reader.read(env);

    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toBe("slow");
  });

  test("works in record", () => {
    const env = { MODE: "fast", PORT: "8080" };
    const reader = ER.record({
      mode: ER.enm("MODE", ["fast", "slow"]),
      port: ER.int("PORT"),
    });
    const result = reader.read(env);

    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual({ mode: "fast", port: 8080 });
  });
});

describe("ER.fallback", () => {
  test("uses value when present", () => {
    const env = { FOO: "bar" };
    const reader = ER.str("FOO").fallback("default");
    const result = reader.read(env);

    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toBe("bar");
  });

  test("uses fallback when key missing", () => {
    const env = {};
    const reader = ER.str("FOO").fallback("default");
    const result = reader.read(env);

    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toBe("default");
  });

  test("uses fallback when validation fails", () => {
    const env = { PORT: "invalid" };
    const reader = ER.int("PORT").fallback(3000);
    const result = reader.read(env);

    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toBe(3000);
  });
});

describe("ER.predicate", () => {
  test("passes value when predicate returns true", () => {
    const env = { PORT: "8080" };
    const reader = ER.int("PORT").predicate(
      (n) => n >= 1000,
      "Port must be >= 1000",
    );
    const result = reader.read(env);

    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toBe(8080);
  });

  test("returns error when predicate returns false", () => {
    const env = { PORT: "80" };
    const reader = ER.int("PORT").predicate(
      (n) => n >= 1000,
      "Port must be >= 1000",
    );
    const result = reader.read(env);

    expect(result.isLeft()).toBe(true);
    expect(result.unwrap()).toEqual({
      type: "invalid",
      key: "PORT",
      why: "Port must be >= 1000",
    });
  });

  test("propagates earlier errors before predicate check", () => {
    const env = {};
    const reader = ER.int("PORT").predicate(
      (n) => n >= 1000,
      "Port must be >= 1000",
    );
    const result = reader.read(env);

    expect(result.isLeft()).toBe(true);
    expect(result.unwrap()).toEqual({ type: "not_found", key: "PORT" });
  });

  test("combines with fallback", () => {
    const env = {};
    const reader = ER.int("PORT")
      .fallback(3000)
      .predicate((n) => n >= 1000, "Port must be >= 1000");
    const result = reader.read(env);

    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toBe(3000);
  });
});

describe(ER.record, () => {
  test("reads all values successfully", () => {
    const env = { HOST: "localhost", PORT: "8080" };
    const reader = ER.record({
      host: ER.str("HOST"),
      port: ER.int("PORT"),
    });
    const result = reader.read(env);

    expect(result.isRight()).toBe(true);
    const config = result.unwrap();
    expect(config).toEqual({ host: "localhost", port: 8080 });
  });

  test("returns error when one value missing", () => {
    const env = { HOST: "localhost" };
    const reader = ER.record({
      host: ER.str("HOST"),
      port: ER.int("PORT"),
    });
    const result = reader.read(env);

    expect(result.isLeft()).toBe(true);
    const error = result.unwrap();
    expect(error).toEqual({
      type: "multiple",
      errors: [{ type: "not_found", key: "PORT" }],
    });
  });

  test("collects multiple errors", () => {
    const env = {};
    const reader = ER.record({
      host: ER.str("HOST"),
      port: ER.int("PORT"),
      debug: ER.str("DEBUG"),
    });
    const result = reader.read(env);

    expect(result.isLeft()).toBe(true);
    const error = result.unwrap();
    expect(error).toEqual({
      type: "multiple",
      errors: [
        { type: "not_found", key: "HOST" },
        { type: "not_found", key: "PORT" },
        { type: "not_found", key: "DEBUG" },
      ],
    });
  });

  test("works with fallbacks", () => {
    const env = { HOST: "localhost" };
    const reader = ER.record({
      host: ER.str("HOST"),
      port: ER.int("PORT").fallback(3000),
    });
    const result = reader.read(env);

    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual({ host: "localhost", port: 3000 });
  });

  test("works with predicates", () => {
    const env = { PORT: "8080", MAX_CONNECTIONS: "100" };
    const reader = ER.record({
      port: ER.int("PORT").predicate((n) => n >= 1000, "Port must be >= 1000"),
      maxConnections: ER.int("MAX_CONNECTIONS").predicate(
        (n) => n >= 10,
        "Max connections must be >= 10",
      ),
    });
    const result = reader.read(env);

    expect(result.isRight()).toBe(true);
  });

  test("collects validation errors", () => {
    const env = { PORT: "80", MAX_CONNECTIONS: "5" };
    const reader = ER.record({
      port: ER.int("PORT").predicate((n) => n >= 1000, "Port must be >= 1000"),
      maxConnections: ER.int("MAX_CONNECTIONS").predicate(
        (n) => n >= 10,
        "Max connections must be >= 10",
      ),
    });
    const result = reader.read(env);

    expect(result.isLeft()).toBe(true);
    const error = result.unwrap();
    expect(error).toEqual({
      type: "multiple",
      errors: [
        { type: "invalid", key: "PORT", why: "Port must be >= 1000" },
        {
          type: "invalid",
          key: "MAX_CONNECTIONS",
          why: "Max connections must be >= 10",
        },
      ],
    });
  });

  test("handles empty record", () => {
    const env = {};
    const reader = ER.record({});
    const result = reader.read(env);

    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toEqual({});
  });

  test("preserves key names", () => {
    const env = { DATABASE_URL: "postgres://localhost" };
    const reader = ER.record({
      databaseUrl: ER.str("DATABASE_URL"),
    });
    const result = reader.read(env);

    expect(result.isRight()).toBe(true);
    const config = result.unwrap();
    expect(config).toEqual({ databaseUrl: "postgres://localhost" });
  });
});

describe("ER composition", () => {
  test("chains multiple transformations", () => {
    const env = { PORT: "8080" };
    const reader = ER.int("PORT")
      .predicate((n) => n >= 1000, "Port must be >= 1000")
      .fallback(3000);
    const result = reader.read(env);

    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toBe(8080);
  });

  test("fallback after predicate uses fallback on predicate failure", () => {
    const env = { PORT: "80" };
    const reader = ER.int("PORT")
      .predicate((n) => n >= 1000, "Port must be >= 1000")
      .fallback(3000);
    const result = reader.read(env);

    expect(result.isRight()).toBe(true);
    expect(result.unwrap()).toBe(3000);
  });

  test("nested records", () => {
    const env = {
      DB_HOST: "localhost",
      DB_PORT: "5432",
      REDIS_HOST: "localhost",
      REDIS_PORT: "6379",
    };

    const databaseReader = ER.record({
      host: ER.str("DB_HOST"),
      port: ER.int("DB_PORT"),
    });

    const redisReader = ER.record({
      host: ER.str("REDIS_HOST"),
      port: ER.int("REDIS_PORT"),
    });

    const dbResult = databaseReader.read(env);
    const redisResult = redisReader.read(env);

    expect(dbResult.isRight()).toBe(true);
    expect(redisResult.isRight()).toBe(true);
    expect(dbResult.unwrap()).toEqual({ host: "localhost", port: 5432 });
    expect(redisResult.unwrap()).toEqual({ host: "localhost", port: 6379 });
  });
});
