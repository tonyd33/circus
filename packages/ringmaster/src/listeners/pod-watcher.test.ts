import { test, expect, mock, spyOn } from "bun:test";
import type * as k8s from "@kubernetes/client-node";
import type { Logger } from "@mnke/circus-shared";
import { PodWatcher } from "./pod-watcher";

// Mock the Kubernetes client
const mockKubeConfig = {
  loadFromDefault: () => {},
};

const mockWatch = {
  watch: mock(() => Promise.resolve()),
};

// Mock logger
const createMockLogger = (): Logger.Logger => ({
  info: mock(() => {}),
  warn: mock(() => {}),
  error: mock(() => {}),
  debug: mock(() => {}),
  child: mock(() => ({
    info: mock(() => {}),
    warn: mock(() => {}),
    error: mock(() => {}),
    debug: mock(() => {}),
  })),
});

// Mock event handler
const mockEventHandler = {
  handleEvent: mock(async () => {}),
};

test("PodWatcher exposes health status", () => {
  // Note: Full testing requires mocking the Kubernetes client
  // This test demonstrates the health check API
  const logger = createMockLogger();

  const watcher = new PodWatcher(
    "default",
    mockEventHandler as any,
    logger as any,
  );

  const health = watcher.getHealthStatus();
  expect(health).toMatchObject({
    isRunning: expect.any(Boolean),
    lastSuccessfulConnection: expect.any([Number, null]),
    consecutiveFailures: expect.any(Number),
  });
});

test("Health status reflects watcher state", async () => {
  const logger = createMockLogger();
  const watcher = new PodWatcher(
    "default",
    mockEventHandler as any,
    logger as any,
  );

  // Initially not running
  expect(watcher.getHealthStatus().isRunning).toBe(false);

  // After stop, should still not be running
  await watcher.stop();
  expect(watcher.getHealthStatus().isRunning).toBe(false);
});
