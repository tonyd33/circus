# Transfer-Based Handoff Design

## Overview

The transfer-based handoff system replaces the legacy in-place transmogrification mechanism with a graceful, explicit profile switching system that preserves context and enables future multi-chimp subscriptions.

## Architecture

### Key Differences from Transmogrify

| Aspect | Transmogrify | Handoff |
|--------|--------------|---------|
| **Initiation** | Ringmaster orchestrates | Chimp requests explicitly |
| **Old Chimp Lifecycle** | Force-killed by ringmaster | Self-initiated graceful shutdown |
| **Context Transfer** | Implicit routing | Explicit message payload |
| **Topic Management** | Ringmaster coordinates | Old chimp unsubscribes cleanly |
| **Reliability** | Single point of failure | Explicit state machine |
| **Future-Proof** | 1-to-1 topic binding only | Foundation for multi-chimp |

### Message Flow

```
Current Chimp                    Ringmaster                    New Chimp
     │                                │                           │
     ├─ publishes ChimpHandoff       │                           │
     │  (targetProfile,               │                           │
     │   subscriptions,               │                           │
     │   eventContexts)               │                           │
     │                                ▼                           │
     │                        ┌─────────────────┐               │
     │                        │ Handoff Action  │               │
     │                        │ - Create new    │               │
     │                        │ - Send resume   │               │
     │                        │ - Register      │               │
     │                        │   subscriptions │               │
     │                        └─────────────────┘               │
     │                                │                           │
     │                                ├─ Create Job ──────────▶  │
     │                                │  (new pod)                │
     │                                │                    ┌──────┘
     │                                │                    │ Start
     │                                │                    │ Receive resume-handoff
     │                                │                    │ command
     │                                │◀──────────────────┘
     │                                │ Meta: ChimpStarted
     │                                │
     │ (Receives meta event)           │
     │ ChimpStarted for new chimp      │
     │                                │
     ├─ unsubscribeAll()              │
     │ (cleanup)                       │
     │                                │
     ├─ publish Stop                  │
     │                                │
     │                                ├─ Cleanup old chimp
     │                                │ - Delete job
     │                                │ - Delete state
     │                                │
     └────────────────────────────────┘
```

## Protocol Messages

### ChimpHandoff (Output)

Published by current chimp when requesting handoff:

```typescript
{
  type: "chimp-handoff",
  targetProfile: string,           // Profile for new chimp
  reason: string,                  // Why handoff is needed
  summary: string,                 // Context for new chimp
  subscriptions: Topic[],          // Topics to transfer
  eventContexts: EventContext[]    // Events to replay
}
```

### ResumeHandoff (Command)

Sent to new chimp when it starts:

```typescript
{
  command: "resume-handoff",
  args: {
    fromProfile: string,              // Origin profile
    reason: string,                   // Handoff reason
    summary: string,                  // Work summary
    subscriptions: Topic[],           // Inherited topics
    eventContexts: EventContext[]     // Inherited contexts
  }
}
```

### HandoffComplete (Output, Future)

Sent by old chimp after unsubscribing:

```typescript
{
  type: "handoff-complete",
  fromChimpId: string,
  toChimpId: string,
  unsubscribedCount: number
}
```

## Implementation Components

### 1. Protocol Layer (`packages/shared/src/protocol.ts`)

- `ChimpHandoffSchema` - Output message for handoff requests
- `ResumeHandoffCommandSchema` - Command for new chimp startup
- `HandoffCompleteSchema` - Meta event (future)

### 2. Ringmaster Core (`packages/ringmaster/src/core/core.ts`)

- `handoff` action type in `Action` union
- `decideOnChimpHandoff()` function generates orchestration actions
- `chimp-handoff` case in `decideOnChimpOutput()` switch

### 3. Event Handler (`packages/ringmaster/src/core/event-handler.ts`)

- `handoff` case in `executeAction()` switch
- Creates new chimp consumer with subscriptions
- Publishes resume command with full context
- Registers topics for new chimp

### 4. Output Listener (`packages/ringmaster/src/listeners/output-listener.ts`)

- Looks up chimp profile from state manager
- Passes profile to event handler for context

### 5. Chimp Brain (`packages/chimp/src/chimp-brain/chimp-brain.ts`)

- `setTopicRegistry()` - Accept dependency injection
- `handleResumeHandoff()` - Handle resume command
- `requestHandoff()` - Initiate handoff (future public API)
- `gracefulShutdown()` - Unsubscribe before stop

### 6. MCP Tools (`packages/chimp/src/mcp/circus-mcp.ts`)

- `handoff` tool - New recommended interface
- `transmogrify` tool - Legacy (deprecated but functional)

## State Transitions

### Old Chimp
```
running → [handoff request] → waiting_for_confirmation → unsubscribing → stopped
```

### New Chimp
```
(created) → pending → running → handling_handoff → ready_for_work
```

### Ringmaster
```
(idle) → [handoff message] → orchestrating → new_chimp_running → cleanup
```

## Benefits

✅ **Explicit Control** - Chimp owns its lifecycle, not orchestrated  
✅ **Graceful Shutdown** - Clean unsubscribe before stopping  
✅ **Resilience** - If new chimp fails, old chimp can retry  
✅ **Context Preservation** - Explicit message payload, no implicit routing  
✅ **Future-Proof** - Foundation for multi-chimp subscriptions  
✅ **Backward Compatible** - Transmogrify still works, marked deprecated  

## Usage

### For Agents (MCP Tool)

```
handoff(targetProfile="worker", 
        reason="implementing the feature", 
        summary="completed design phase")
```

### For Custom Code

```typescript
// Request handoff
await brain.requestHandoff("worker", "reason", "summary");

// Or publish directly
brain.publish({
  type: "chimp-handoff",
  targetProfile: "worker",
  reason: "reason",
  summary: "summary",
  subscriptions: await topicRegistry.listForChimp(chimpId),
  eventContexts: []
});
```

## Migration Path

### Phase 1: Current (Transfer-Based Handoff) ✓
- Handoff fully implemented and functional
- Transmogrify remains for backward compatibility
- New agents should use `handoff` tool

### Phase 2: Multi-Chimp Subscriptions (Future)
- Topic registry supports multiple subscribers
- Events can be routed to multiple chimps
- Enables redundancy and failover

### Phase 3: Deprecation (Future Major Version)
- Remove `transmogrify` tool and message types
- Handoff becomes the only handoff mechanism

## Testing

### Unit Tests (`packages/ringmaster/src/core/core.test.ts`)
- ✓ Handoff creates new chimp with action
- ✓ Subscriptions transferred to new chimp
- ✓ Event contexts preserved
- ✓ Deterministic chimp ID derivation

### Integration Tests (Future)
- Full flow with NATS messaging
- Subscription transfer verification
- Event context restoration

### E2E Tests (Future)
- Real handoff between scout and worker profiles
- Context preservation validation
- No event loss during transition

## Edge Cases

### New Chimp Startup Failure
- Old chimp waits for confirmation
- If timeout, can retry or cleanup manually
- No automatic rollback (operator intervention)

### Subscription Update During Handoff
- Topics added before handoff completes are lost
- Recommend no new subscriptions during handoff
- New chimp can re-request subscriptions

### Event Ordering
- Events for old chimp's topics may arrive at new chimp
- New chimp handles via `listForChimp()` at startup
- No event loss, but some duplication possible

## Future Enhancements

1. **Async Handoff Confirmation** - Don't wait for new chimp to be fully ready
2. **Conditional Subscriptions** - Transfer only relevant topics
3. **Failover Support** - Retry logic if new chimp fails
4. **Multi-Chimp Load Balancing** - Distribute work across subscribers
5. **Subscription Affinity** - Prefer certain chimps for certain topics
