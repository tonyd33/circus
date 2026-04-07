/**
 * Basic tests for the logger
 */

import { test, expect } from "bun:test";
import { createLogger, noopLogger } from "./logger.ts";

test("createLogger returns a logger instance", () => {
  const logger = createLogger("TestComponent");

  expect(logger).toBeDefined();
  expect(typeof logger.info).toBe("function");
  expect(typeof logger.error).toBe("function");
  expect(typeof logger.warn).toBe("function");
  expect(typeof logger.debug).toBe("function");
});

test("logger can log messages without crashing", () => {
  const logger = createLogger("TestComponent");

  // These should not throw
  expect(() => logger.info("Test message")).not.toThrow();
  expect(() => logger.info({ test: "data" }, "Test with object")).not.toThrow();
  expect(() => logger.error("Error message")).not.toThrow();
  expect(() => logger.warn("Warning message")).not.toThrow();
  expect(() => logger.debug("Debug message")).not.toThrow();
});

test("noopLogger has all methods", () => {
  expect(typeof noopLogger.info).toBe("function");
  expect(typeof noopLogger.error).toBe("function");
  expect(typeof noopLogger.warn).toBe("function");
  expect(typeof noopLogger.debug).toBe("function");
});

test("noopLogger does not crash when called", () => {
  expect(() => noopLogger.info("Test")).not.toThrow();
  expect(() => noopLogger.error("Test")).not.toThrow();
  expect(() => noopLogger.warn("Test")).not.toThrow();
  expect(() => noopLogger.debug("Test")).not.toThrow();
});
