import { describe, expect, test } from "bun:test";

import * as Errors from "./errors";

describe("formatReadError", () => {
  test("formats not_found error", () => {
    const error = Errors.notFoundError("DATABASE_URL");
    const formatted = Errors.formatReadError(error);
    expect(formatted).toBe("DATABASE_URL: not found");
  });

  test("formats invalid error", () => {
    const error = Errors.validationError(
      "PORT",
      "Must be between 1000 and 9999",
    );
    const formatted = Errors.formatReadError(error);
    expect(formatted).toBe("PORT: Must be between 1000 and 9999");
  });

  test("formats multiple errors", () => {
    const error1 = Errors.notFoundError("HOST");
    const error2 = Errors.validationError("PORT", "Not a number");
    const error3 = Errors.notFoundError("DEBUG");
    const joined = Errors.joinErrors([error1, error2, error3]);

    const formatted = Errors.formatReadError(joined);
    expect(formatted).toBe(
      "HOST: not found\nPORT: Not a number\nDEBUG: not found",
    );
  });

  test("formats empty multiple errors", () => {
    const joined = Errors.joinErrors([]);
    const formatted = Errors.formatReadError(joined);
    expect(formatted).toBe("");
  });

  test("formats nested multiple errors", () => {
    const error1 = Errors.notFoundError("VAR1");
    const error2 = Errors.notFoundError("VAR2");
    const inner = Errors.joinErrors([error1, error2]);

    const error3 = Errors.validationError("VAR3", "Invalid");
    const outer = Errors.joinErrors([inner, error3]);

    const formatted = Errors.formatReadError(outer);
    expect(formatted).toBe("VAR1: not found\nVAR2: not found\nVAR3: Invalid");
  });
});
