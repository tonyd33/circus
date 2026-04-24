# Async Iterable Chimp Brain Design Plan

## Overview

Enable chimp brains to accept prompts as async iterables, allowing users to interrupt mid-execution by sending new messages. This mirrors the existing Claude brain's ability to accept `AsyncIterable<string>` prompts for immediate interruption.

**Goal Workflow:**
1. Chimp starts processing a prompt (e.g., "take approach A")
2. While processing, user sends another message (e.g., "actually use approach B")
3. The new prompt interrupts the current one immediately via the async iterable

## Current State

### Claude Brain
- Uses `ClaudeSDK.query()` which returns `AsyncIterable<ChimpOutputMessage>`
- Consumes it with `for await (const message of queryStream)`
- Already supports interruption via async iterable prompts (SDKs handle this internally)

### Other Brains (Echo, Opencode)
- Simple `handlePrompt(prompt: string): Promise<CommandResult>` interface
- No streaming support

### Protocol Layer
- `send-agent-message` command carries `prompt: string`
- No streaming/async iterable support

### Input Transport
- Commands received as complete messages
- No mechanism to stream prompt chunks as they arrive

## Design Approach

### 1. **ChimpBrain Interface Extension**
```
handlePrompt(prompt: string | AsyncIterable<string>): Promise<CommandResult>
```

Brains can now accept:
- **String**: Complete prompt (backward compatible)
- **AsyncIterable<string>**: Prompt chunks arriving over time

### 2. **Protocol Enhancement**
Add streaming support to `send-agent-message`:
- New **command type**: `send-agent-message-stream` (or extend existing command)
- Carries: Initial prompt chunk + stream identifier
- Subsequent chunks via new **message type**: `agent-message-chunk`
  ```
  {
    type: "agent-message-chunk",
    streamId: string,
    content: string,
    isFinal: boolean
  }
  ```

**Rationale**: 
- Maintains backward compatibility (string prompts remain unchanged)
- Clear separation: string → immediate, streaming → interrupted

### 3. **Input Transport Layer**
Update `ChimpInput` to handle streaming:
- Detect `send-agent-message` with stream indicator
- Buffer subsequent `agent-message-chunk` messages
- Construct async iterable generator on the brain side
- Pass to `brain.handlePrompt(asyncIterable)`

### 4. **Prompt Buffer & Async Iterable Generation**
Create `PromptStreamBuffer` utility:
```typescript
class PromptStreamBuffer {
  addChunk(content: string, isFinal: boolean): void
  generateAsyncIterable(): AsyncIterable<string>
  cancel(): void
}
```

Used by:
- Input transport: collects chunks
- Brain: consumes as async iterable
- Cancellation: allows immediate interruption

### 5. **Brain Implementation Strategy**

#### Claude Brain (no changes needed)
- Already passes prompts to `ClaudeSDK.query()`
- SDK handles async iterable natively
- Just update signature to accept `string | AsyncIterable<string>`

#### Echo/Opencode Brains
- Accept async iterable, consume first chunk: `const firstChunk = await iterator.next()`
- For simplicity: concatenate all chunks before processing
- Future: add early interruption support

#### Base ChimpBrain Class
- Add helper: `async function collectAsyncIterable(iterable: AsyncIterable<string>): Promise<string>`
- Subclasses can use for easy migration (backward compat)

### 6. **Backpressure & Cancellation**
- Async iterable allows Claude SDK to pause/resume internally
- Base layer respects `AbortSignal` if provided
- Graceful shutdown: finish current chunk, don't fetch next

## Implementation Tasks

### Phase 1: Protocol & Infrastructure
- [ ] **protocol.ts**: Add `agent-message-chunk` message type and `send-agent-message-stream` command (or stream variant)
- [ ] **PromptStreamBuffer**: Create utility to manage streaming prompts
- [ ] **Input transport**: Update to detect and handle streaming commands

### Phase 2: ChimpBrain Interface
- [ ] Update `ChimpBrain.handlePrompt()` signature to accept `string | AsyncIterable<string>`
- [ ] Add helper method `collectAsyncIterable()` for backward compatibility

### Phase 3: Brain Implementation
- [ ] **Claude Brain**: Update signature, test with async iterable
- [ ] **Echo Brain**: Update signature, concatenate chunks before echo
- [ ] **Opencode Brain**: Update signature, concatenate chunks before processing

### Phase 4: Integration & Testing
- [ ] Update command handler in `chimp-brain.ts` to route streaming commands
- [ ] Add tests: string → brain, async iterable → brain, mid-stream interruption
- [ ] Verify Claude brain can still be interrupted mid-execution
- [ ] Manual test: trigger chimp, send interrupt message while processing

## File Changes Summary

| File | Changes |
|------|---------|
| `packages/shared/src/protocol.ts` | Add stream command/message types |
| `packages/chimp/src/chimp-brain/chimp-brain.ts` | Update `handlePrompt()` signature, add helper |
| `packages/chimp/src/chimp-brain/claude/claude-brain.ts` | Update signature |
| `packages/chimp/src/chimp-brain/echo/echo-brain.ts` | Update signature, concatenate chunks |
| `packages/chimp/src/chimp-brain/opencode/opencode-brain.ts` | Update signature, concatenate chunks |
| `packages/chimp/src/transports/input/input.ts` | Base class to support streaming |
| `packages/chimp/src/transports/input/nats.ts` (or equivalent) | Implement streaming logic |
| `packages/chimp/src/lib/` | New `PromptStreamBuffer` utility |

## Backward Compatibility
- String prompts work as before → no breaking changes for existing callers
- Brains updated to accept both types → handles both gracefully
- Echo/Opencode concatenate chunks → simple migration path

## Future Enhancements
- Early interruption for Echo/Opencode (not just concatenate)
- Stream-aware logging/progress tracking
- Timeout for unclosed streams
- Per-stream metrics (latency, chunk count)

## Key Design Decisions

1. **Separate command type** (`send-agent-message-stream`) for clarity and backward compatibility
2. **Async iterable at brain level** (not transport level) for maximum flexibility
3. **Helper for easy migration** (collect all chunks) makes adoption simple
4. **Respect Claude SDK's internal handling** rather than reinvent async logic
