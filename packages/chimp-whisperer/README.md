# Chimp Whisperer

A TypeScript client library for communicating with Chimp agents via Conduit exchanges. Provides a type-safe, high-level interface for the Chimp protocol.

## Features

- **Type-safe Protocol**: Fully typed interface based on the Chimp protocol
- **Easy Exchange Creation**: Automatically creates and manages Conduit Exchanges
- **Session Management**: Support for session continuity, forking, and resuming
- **Autonomous Messages**: Subscribe to progress updates, logs, and artifacts
- **Command Support**: Full support for all Chimp protocol commands
- **Clean Lifecycle**: Simple creation and cleanup with `create()` and `destroy()`

## Installation

```bash
bun install
```

## Quick Start - Interactive REPL

The easiest way to get started is with the interactive REPL:

```bash
# Make sure you have ANTHROPIC_API_KEY set
export ANTHROPIC_API_KEY=sk-...

# Start the interactive session
bun run repl

# Or specify a custom exchange name
bun run repl my-chimp-session
```

You'll get an interactive prompt where you can chat with the chimp:

```
╔════════════════════════════════════════╗
║      Chimp Whisperer Interactive      ║
╚════════════════════════════════════════╝

✓ Connected!

Ready! Type your message or /help for commands

You: > Write a function to calculate fibonacci numbers
Thinking...

Chimp:
I'll write a TypeScript function to calculate fibonacci numbers...
[agent response here]

You: >
```

### REPL Commands

- `/help` - Show help message
- `/status` - Get agent status
- `/new-session` - Start a new session
- `/fork` - Fork the current session
- `/model <name>` - Change the Claude model
- `/tools <tools...>` - Set allowed tools (comma-separated)
- `/exit` or `/quit` - Exit the REPL

### Environment Variables

- `ANTHROPIC_API_KEY` - Your Anthropic API key (required)
- `CONDUIT_API_URL` - Conduit API server (default: http://localhost:8090)
- `CHIMP_IMAGE` - Chimp container image (default: circus-chimp:latest)
- `CHIMP_NAMESPACE` - Kubernetes namespace (default: default)

## Programmatic Usage

**Important**: ChimpWhisperer uses a **pure streaming model**. There is no request/response pattern. All messages (including command responses) come through the `subscribe()` handler.

```typescript
import { ChimpWhisperer } from "@mnke/circus-chimp-whisperer";

// Create a Chimp Exchange and connect
const whisperer = await ChimpWhisperer.create({
  apiBaseUrl: "http://localhost:8090",
  exchangeName: "my-chimp",
  image: "circus-chimp:latest",
  env: [
    { Name: "ANTHROPIC_API_KEY", Value: "sk-..." },
  ],
});

// Subscribe to ALL messages from the chimp
whisperer.subscribe((message) => {
  switch (message.type) {
    case "agent-message-response":
      console.log("Agent:", message.content);
      break;
    case "progress":
      console.log(`Progress: ${message.message}`);
      break;
    case "log":
      console.log(`[${message.level}] ${message.message}`);
      break;
    // ... handle other message types
  }
});

// Send a message to the agent (response comes via subscribe handler)
await whisperer.sendMessage("Write a function to calculate fibonacci numbers");

// Keep the program running to receive messages
// Or: await whisperer.destroy() when done
```

## API Reference

### `ChimpWhisperer.create(config)`

Creates a new Chimp Exchange and returns a connected client.

**Config:**
- `apiBaseUrl`: Conduit API server URL
- `exchangeName`: Name for the Exchange
- `namespace`: Kubernetes namespace (default: "default")
- `image`: Chimp container image
- `env`: Environment variables (include `ANTHROPIC_API_KEY`)

### Message Commands

**All these methods send messages but DO NOT return responses. Responses come through the `subscribe()` handler.**

#### `sendMessage(prompt)`

Send a message to the Claude agent. The response will arrive as an `agent-message-response` message.

```typescript
await whisperer.sendMessage("Write a function to check if a number is prime");
// Response comes via subscribe() handler
```

#### `sendCommand(command)`

Send a raw command (for advanced usage).

```typescript
await whisperer.sendCommand({
  command: "send-agent-message",
  args: { prompt: "Hello!" },
});
// Response comes via subscribe() handler
```

### Session Management

#### `getStatus()`

Request current agent status. The response arrives as a `status-response` message.

```typescript
await whisperer.getStatus();
// Response comes via subscribe() handler
```

#### `newSession()`

Start a new session (abandons current session).

```typescript
await whisperer.newSession();
```

#### `resumeSession(sessionId)`

Resume a specific session by ID.

```typescript
await whisperer.resumeSession("session-123");
```

#### `forkSession()`

Fork the current session. The response arrives as a `fork-session-response` message.

```typescript
await whisperer.forkSession();
// Response comes via subscribe() handler with originalSessionId and forkedSessionId
```

### Configuration

#### `setModel(model)`

Change the Claude model.

```typescript
await whisperer.setModel("claude-opus-4");
```

#### `setAllowedTools(tools)`

Configure which tools the agent can use.

```typescript
await whisperer.setAllowedTools(["Read", "Write", "Edit", "Bash"]);
```

### Autonomous Messages

#### `subscribe(handler)`

Subscribe to autonomous messages (progress, logs, artifacts).

```typescript
await whisperer.subscribe((message) => {
  switch (message.type) {
    case "progress":
      console.log(`Progress: ${message.message}`);
      break;
    case "log":
      console.log(`Log: ${message.message}`);
      break;
    case "artifact":
      console.log(`Artifact: ${message.name}`);
      break;
  }
});
```

### Cleanup

#### `close()`

Close the connection (keeps the Exchange running).

```typescript
await whisperer.close();
```

#### `destroy()`

Close connection and delete the Exchange.

```typescript
await whisperer.destroy();
```

## How It Works

The ChimpWhisperer uses a **pure streaming model**:

1. **Send** - Commands are sent to the chimp via `client.send()`
2. **Subscribe** - ALL messages come back via the subscription stream
3. **No Response** - Methods like `sendMessage()` do NOT return responses

```
You                          Chimp Agent
 │                                │
 ├─ sendMessage() ───────────────>│
 │                                │
 │<──── log message ──────────────┤
 │<──── progress update ──────────┤
 │<──── agent-message-response ───┤
 │<──── artifact ─────────────────┤
 │                                │
 ├─ getStatus() ─────────────────>│
 │<──── status-response ──────────┤
```

All messages come through the `subscribe()` handler, including:
- Command responses (agent-message-response, status-response, etc.)
- Autonomous messages (progress, log, artifact)
- Errors

## Connecting to Existing Exchange

If you already have a Chimp Exchange running and want to connect to it:

```typescript
import { connectToChimp } from "@mnke/circus-chimp-whisperer";
import { connect } from "nats";

// Connect to NATS manually
const nc = await connect({ servers: "nats://localhost:4222" });
const js = nc.jetstream();

const whisperer = connectToChimp(nc, js, {
  subjectInput: "exchange.my-chimp.input",
  subjectOutput: "exchange.my-chimp.output",
});

// Use normally (but don't call destroy())
const response = await whisperer.sendMessage("Hello!");

// Clean up manually
await whisperer.close();
```

## Prerequisites

- Conduit API server running
- NATS server with JetStream enabled
- Chimp container image available
- Anthropic API key

## Protocol

This client implements the Chimp protocol as defined in `@mnke/circus-protocol`. All messages are automatically validated and typed according to the protocol specification.
