# Ringmaster Core Architecture

## Overview

The Ringmaster has been refactored to use a **pure functional core** with an **effectful shell**. This architecture separates business logic from I/O operations, making the code more testable and easier to reason about.

## Architecture Layers

```
┌─────────────────────────────────────────┐
│         Event Sources (Shell)           │
│  - CompletionListener                   │
│  - PodWatcher                           │
│  - MessageListener                      │
│  - Reconciler Timer                     │
└───────────────┬─────────────────────────┘
                │
                │ Events
                ▼
┌─────────────────────────────────────────┐
│       Core Adapter (Bridge)             │
│  - Gathers StateSnapshot from Redis/K8s │
│  - Calls pure core logic                │
│  - Executes resulting Actions           │
└───────────────┬─────────────────────────┘
                │
                │ StateSnapshot + TriggerEvent
                ▼
┌─────────────────────────────────────────┐
│        Pure Core (No I/O)               │
│  - decide()                             │
│  - decideOnCompletion()                 │
│  - decideOnPodEvent()                   │
│  - decideOnMessageReceived()            │
│  - decideOnReconcile()                  │
└───────────────┬─────────────────────────┘
                │
                │ Decision (list of Actions)
                ▼
┌─────────────────────────────────────────┐
│    Action Executors (Shell)             │
│  - PodManager                           │
│  - StreamManager                        │
│  - Redis operations                     │
└─────────────────────────────────────────┘
```

## Key Files

### Pure Core (`core.ts`)
- **No side effects**: All functions are pure and deterministic
- **Input**: `StateSnapshot` + `TriggerEvent`
- **Output**: `Decision` (list of `Action`s)
- **Testable**: Can test all logic with simple unit tests

### Core Adapter (`core-adapter.ts`)
- **Bridges** effectful world and pure core
- **Gathers** state snapshots from Redis/K8s
- **Executes** actions returned by core logic
- **Entry point**: `handleEvent()` function

### Reconciler (`reconciler.ts`)
- **Simplified**: No longer contains business logic
- **Delegates** all decisions to core layer
- **Coordinates** event listeners and periodic reconciliation

## Data Flow

1. **Event arrives** (e.g., pod deleted, message received)
2. **Core Adapter gathers** current state into `StateSnapshot`
3. **Pure core decides** what actions to take based on snapshot + event
4. **Core Adapter executes** the actions (create pod, delete session, etc.)

## State Snapshot

The `StateSnapshot` contains all information needed for decision-making:

```typescript
interface StateSnapshot {
  sessionExists: boolean;        // Does session:chimpName exist in Redis?
  health: {                       // Health from chimp:chimpName:health
    lastHeartbeat: number;
    messageCount: number;
  } | null;
  podStatus: "running" | "pending" | "failed" | "deleted" | "missing";
  now: number;                    // Current timestamp
}
```

## Trigger Events

Events that can trigger decisions:

```typescript
type TriggerEvent =
  | { type: "completion"; reason: "idle_timeout" | "explicit_stop" | "error" }
  | { type: "pod_event"; event: "added" | "modified" | "deleted" | "failed" }
  | { type: "message_received" }
  | { type: "reconcile_tick" };
```

## Actions

Actions returned by core logic:

```typescript
type Action =
  | { type: "create_pod" }
  | { type: "delete_pod" }
  | { type: "create_stream" }
  | { type: "delete_stream" }
  | { type: "delete_session" }
  | { type: "delete_health" }
  | { type: "update_chimp_state"; status: "pending" | "running" | "stopped" | "failed" | "unknown" }
  | { type: "noop" };
```

**Chimp Status Values:**
- `pending`: Pod is starting up
- `running`: Pod is running and healthy
- `stopped`: Pod exited normally (idle timeout, explicit stop) - can be restarted
- `failed`: Pod crashed or failed
- `unknown`: Status unknown (initial state or after cleanup)

## Decision Logic

### Completion Event (Chimp shuts down)

**Idle Timeout:**
- ✅ Delete session (prevents recreation)
- ✅ Delete health
- ✅ Delete pod
- ✅ Update state to "unknown"

**Explicit Stop / Error:**
- ❌ Keep session (can be manually restarted)
- ✅ Delete health
- ✅ Delete pod
- ✅ Update state to "unknown"

### Pod Event

**Pod Deleted:**
- If pod exited normally (exit code 0 or phase=Succeeded) → ❌ Do NOT recreate pod (idle timeout/explicit stop)
- If session exists AND pod crashed → ✅ Recreate pod
- If no session → ❌ Do NOT recreate pod

**Pod Failed:**
- If pod exited normally (exit code 0) → ❌ Do NOT recreate pod
- If session exists AND pod crashed (non-zero exit) → ✅ Recreate pod
- If no session → ❌ Do NOT recreate pod

### Message Received

- If chimp healthy → ⏭️ Do nothing
- If chimp unhealthy → ✅ Create stream + pod

### Reconcile Tick

- If chimp healthy → ⏭️ Do nothing
- If chimp unhealthy → ✅ Create stream + pod

## Testing

All core logic is tested in `core.test.ts`:

```bash
bun test core.test.ts
```

**26 tests** covering:
- Health checking
- Completion scenarios (idle timeout, explicit stop, error)
- Pod events (added, modified, deleted, failed)
- Message handling
- Reconciliation
- Critical bug scenarios

## Bug Fixes Verified

The tests verify fixes for these bugs:

1. **Pod recreated after flushall**: ✅ Fixed - only recreates if session exists
2. **Idle timeout doesn't prevent recreation**: ✅ Fixed - deletes session
3. **Pod crashes ignored**: ✅ Fixed - recreates if session exists
4. **Session TTL not reset**: ✅ Fixed in usher/session-store.ts

## Benefits

1. **Testable**: Pure functions are easy to test
2. **Predictable**: No hidden side effects
3. **Debuggable**: Clear data flow
4. **Maintainable**: Business logic separated from I/O
5. **Composable**: Easy to add new event types or actions
