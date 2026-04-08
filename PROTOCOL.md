# Chimp Protocol

This document defines the protocol for communicating with Chimp agents (autonomous AI workers) in the Circus system.

The protocol distinguishes between:
1. **Commands** - Messages sent TO the chimp (incoming)
2. **Output Messages** - Messages sent FROM the chimp (outgoing)

Output messages include both **responses to commands** and **autonomous messages** that the chimp can emit on its own (like progress updates, logs, or artifacts).

## What is a Chimp?

A **Chimp** is an autonomous worker that processes commands and interacts with an AI model via NATS JetStream. Chimps are managed by the Ringmaster and receive work from the Usher.

**Key characteristics:**
- Processes commands from `chimp.{chimpName}.input` NATS subject
- Publishes responses to `chimp.{chimpName}.output` NATS subject
- Publishes heartbeats to `chimp.{chimpName}.heartbeat` every ~10 seconds
- Publishes correlation events to `chimp.{chimpName}.correlation` when creating external resources
- Publishes completion event to `chimp.{chimpName}.control` when shutting down gracefully
- Stateful: maintains session history across messages
- Ephemeral: runs until idle timeout or explicit stop command

## Protocol Version

Current version: `0.1.0`

---

## Chimp Implementation Requirements

This section defines what ANY Chimp implementation (including alternative implementations like "Bonobo") MUST satisfy to be compatible with the Circus system.

### 1. Environment Variables (Required)

The Ringmaster sets these environment variables when creating a Chimp pod. Your implementation MUST read and use them:

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `CHIMP_NAME` | ✅ Yes | Unique identifier for this Chimp instance. Used to construct all NATS subject names. | `slack-C123-T456` |
| `NATS_URL` | ✅ Yes | NATS server connection URL | `nats://nats:4222` |

**AI Model Configuration** (implementation-specific):

The AI model and API keys are **NOT** mandated by the protocol. Implementations are free to use any AI backend:

| Variable | Required | Description | Example |
|----------|----------|-------------|---------|
| `ANTHROPIC_API_KEY` | 📝 If using Anthropic | API key for Claude | `sk-ant-...` |
| `OPENAI_API_KEY` | 📝 If using OpenAI | API key for GPT models | `sk-...` |
| `MODEL` | ⚠️ Optional | Default model to use | `claude-opus-4` |

### 2. NATS JetStream Connection (Required)

Your Chimp MUST:

1. **Connect to NATS JetStream** using the `NATS_URL` environment variable
2. **Construct subject names** from `CHIMP_NAME`:
   ```typescript
   const streamName = `chimp-${CHIMP_NAME}`;
   const inputSubject = `chimp.${CHIMP_NAME}.input`;
   const outputSubject = `chimp.${CHIMP_NAME}.output`;
   const heartbeatSubject = `chimp.${CHIMP_NAME}.heartbeat`;
   const correlationSubject = `chimp.${CHIMP_NAME}.correlation`;
   ```

3. **Consume from JetStream consumer**:
   - Stream: `chimp-${CHIMP_NAME}`
   - Consumer: `chimp-${CHIMP_NAME}-consumer`
   - Filter subject: `chimp.${CHIMP_NAME}.input`
   - Ack policy: Explicit (must call `msg.ack()` after processing)

4. **Publish to output subject**: All responses go to `chimp.${CHIMP_NAME}.output`

### 3. Message Processing (Required)

Your Chimp MUST:

1. **Read messages** from the input subject as JSON
2. **Parse and validate** using the command schema (see Commands section)
3. **Process commands** according to the protocol
4. **Publish responses** to the output subject as JSON
5. **Acknowledge messages** after successful processing

**Error handling:**
- If a command fails, publish an error message (see Error Responses)
- Still acknowledge the message to prevent redelivery
- Log errors for debugging

### 4. Heartbeat Publishing (Required)

Your Chimp MUST publish heartbeat messages every **10 seconds** (±2s) to `chimp.${CHIMP_NAME}.heartbeat`:

```json
{
  "chimpName": "slack-C123-T456",
  "timestamp": 1234567890000,
  "messageCount": 42
}
```

**Fields:**
- `chimpName` (string): The value of `CHIMP_NAME` env var
- `timestamp` (number): Current Unix timestamp in milliseconds
- `messageCount` (number): Total number of messages processed

**Why?** The Ringmaster monitors heartbeats via Redis (30s TTL). If heartbeats stop, the Ringmaster will recreate the Chimp pod after ~60 seconds.

### 5. Control Events (Required)

Your Chimp MUST publish control events to `chimp.${CHIMP_NAME}.control` to announce lifecycle changes:

#### Completion Event

When shutting down gracefully (idle timeout or explicit stop), publish a completion event:

```json
{
  "type": "completion",
  "chimpName": "slack-C123-T456",
  "timestamp": 1234567890000,
  "reason": "idle_timeout",
  "messageCount": 42,
  "sessionId": "session-123"
}
```

**Fields:**
- `type` (string): Always "completion"
- `chimpName` (string): The value of `CHIMP_NAME` env var
- `timestamp` (number): Current Unix timestamp in milliseconds
- `reason` (enum): Why the Chimp is shutting down - "idle_timeout", "explicit_stop", "error"
- `messageCount` (number): Total messages processed
- `sessionId` (string, optional): Current session ID if one exists

**Why?** The Ringmaster listens for completion events to immediately clean up pods and update state. This is much faster than waiting for heartbeat TTL expiration.

### 6. Correlation Events (Required)

When your Chimp creates external resources (GitHub PRs, Jira issues, Slack threads, etc.), it MUST publish correlation events to `chimp.${CHIMP_NAME}.correlation`:

```json
{
  "type": "github-pr",
  "sessionName": "slack-C123-T456",
  "timestamp": 1234567890000,
  "repo": "myorg/myrepo",
  "prNumber": 123
}
```

**Supported types:**

| Type | Required Fields | Example |
|------|----------------|---------|
| `github-pr` | `repo`, `prNumber` | `{"type":"github-pr","repo":"myorg/repo","prNumber":123}` |
| `github-issue` | `repo`, `issueNumber` | `{"type":"github-issue","repo":"myorg/repo","issueNumber":456}` |
| `jira-issue` | `issueKey` | `{"type":"jira-issue","issueKey":"PROJ-123"}` |
| `slack-thread` | `channelId`, `threadTs` | `{"type":"slack-thread","channelId":"C123","threadTs":"1234.5678"}` |
| `discord-thread` | `channelId`, `threadId` | `{"type":"discord-thread","channelId":"123","threadId":"456"}` |

**Why?** The Usher listens to these events and updates Redis indexes. This enables bidirectional correlation: when a user comments on a PR the Chimp created, the Usher routes it back to the same Chimp automatically.

### 7. Idle Timeout (Required)

Your Chimp MUST implement an idle timeout mechanism:

- After **30 minutes** (configurable via `IDLE_TIMEOUT_MS` env var) of no incoming messages, the Chimp MUST:
  1. Publish a completion event with `reason: "idle_timeout"`
  2. Stop publishing heartbeats
  3. Close NATS connection
  4. Exit gracefully

- Reset the idle timer when:
  - A new message is received
  - A command is processed

**Why?** Idle Chimps waste resources. The idle timeout ensures pods are cleaned up automatically. When new work arrives, the Ringmaster will recreate the pod on-demand (messages are buffered in NATS JetStream).

### 8. Command Support (Required)

Your Chimp MUST implement these commands:

| Command | Required | Description |
|---------|----------|-------------|
| `send-agent-message` | ✅ Yes | Process a user prompt with the AI model |
| `get-status` | ✅ Yes | Return current status (sessionId, messageCount, model) |
| `stop` | ✅ Yes | Gracefully shut down with completion event |
| `new-session` | ⚠️ Recommended | Start a new session (abandon current) |
| `set-model` | ⚠️ Optional | Change AI model (if applicable) |
| `set-allowed-tools` | ⚠️ Optional | Configure allowed tools |

All other commands are **optional** (clone-repo, set-working-dir, save-session, restore-session, fork-session, etc.).

### 9. Session Management (Recommended)

Your Chimp SHOULD maintain **session state** across messages:
- Session ID (e.g., Claude SDK session ID)
- Conversation history
- Working directory
- Message count

This enables:
- Multi-turn conversations with context
- Session forking/branching
- Session persistence (save/restore)

**Note:** Session management is implementation-specific. The protocol only requires that `get-status` returns a `sessionId` field if a session exists.

### 10. Graceful Shutdown (Required)

Your Chimp MUST handle:
- `stop` command - publish completion event, stop heartbeats, exit gracefully
- Idle timeout - publish completion event, stop heartbeats, exit gracefully
- `SIGINT` / `SIGTERM` signals - publish completion event, close NATS connection and exit

**Always publish a completion event before shutting down** (except for crashes).

### 11. Example Minimal Implementation

Here's a minimal Chimp implementation in pseudocode:

```typescript
const chimpName = process.env.CHIMP_NAME!;
const natsUrl = process.env.NATS_URL!;

// Connect to NATS
const nc = await connect({ servers: natsUrl });
const js = nc.jetstream();

// Start heartbeat
setInterval(() => {
  nc.publish(`chimp.${chimpName}.heartbeat`, JSON.stringify({
    chimpName,
    timestamp: Date.now(),
    messageCount: state.messageCount,
  }));
}, 10_000);

// Consume messages
const consumer = await js.consumers.get(`chimp-${chimpName}`, `chimp-${chimpName}-consumer`);
for await (const msg of await consumer.consume()) {
  const command = JSON.parse(msg.string());

  // Process command
  const response = await handleCommand(command);

  // Publish response
  if (response) {
    nc.publish(`chimp.${chimpName}.output`, JSON.stringify(response));
  }

  // Acknowledge
  msg.ack();
}
```

### 12. Testing Your Implementation

To verify your Chimp is protocol-compliant:

1. **Environment check**: Can it read `CHIMP_NAME` and `NATS_URL`?
2. **Connection test**: Does it connect to NATS JetStream?
3. **Heartbeat test**: Does it publish heartbeats every 10 seconds?
4. **Command test**: Can it process `send-agent-message` and `get-status`?
5. **Error handling**: Does it publish error messages on failure?
6. **Shutdown test**: Does it stop gracefully on `stop` command and SIGTERM?
7. **Correlation test**: Does it publish correlation events when creating resources?

### 13. Reference Implementation

See `circus/packages/chimp/` for the reference implementation using:
- Claude Agent SDK (Anthropic)
- NATS JetStream for messaging
- Direct NATS connection (no intermediary layers)

---

## Initialization Configuration

Initialization configuration is provided via a JSON file containing an array of commands to execute during chimp startup, before connecting to the runtime message stream.

### Configuration File Format

```json
{
  "version": "0.1.0",
  "commands": [
    {
      "command": "clone-repo",
      "args": {
        "url": "https://github.com/user/repo.git",
        "branch": "main"
      }
    },
    {
      "command": "set-working-dir",
      "args": {
        "path": "repo"
      }
    },
    {
      "command": "resume-session",
      "args": {
        "sessionId": "abc-123-def-456"
      }
    },
    {
      "command": "send-agent-message",
      "args": {
        "prompt": "Familiarize yourself with the codebase"
      }
    }
  ]
}
```

### Configuration Location

The chimp looks for initialization configuration in the following locations (in order):

1. Path specified in `CHIMP_CONFIG_PATH` environment variable
2. `/etc/chimp/config.json` (standard mount point)
3. `./chimp.config.json` (current directory)

If no configuration file is found, the chimp starts with default settings.

---

## Commands (Incoming Messages)

Commands are messages sent TO the chimp to instruct it to perform actions.

### Command Structure

All commands follow this format:

```json
{
  "command": "command-name",
  "args": {
    // command-specific arguments
  }
}
```

### Available Commands

#### `send-agent-message`

Send a prompt to the Claude agent for processing.

**Request:**
```json
{
  "command": "send-agent-message",
  "args": {
    "prompt": "Analyze the authentication module"
  }
}
```

**Response:**
```json
{
  "type": "agent-message-response",
  "content": "I've analyzed the authentication module...",
  "sessionId": "session-123"
}
```

#### `get-status`

Get the current worker status and session information.

**Request:**
```json
{
  "command": "get-status"
}
```

**Response:**
```json
{
  "type": "status-response",
  "sessionId": "session-123",
  "messageCount": 42,
  "model": "claude-haiku-4-5"
}
```

#### `new-session`

Start a new session, abandoning the current one.

**Request:**
```json
{
  "command": "new-session"
}
```

**Response:** No response.

#### `fork-session`

Fork the current session to explore alternative paths. **(Not yet implemented)**

**Request:**
```json
{
  "command": "fork-session"
}
```

**Response:** Not yet implemented.

#### `stop`

Gracefully stop the worker. (No response - worker terminates)

**Request:**
```json
{
  "command": "stop"
}
```

#### `clone-repo`

Clone a git repository. Typically used during initialization.

**Request:**
```json
{
  "command": "clone-repo",
  "args": {
    "url": "https://github.com/user/repo.git",
    "branch": "main",  // optional
    "path": "/workspace"  // optional
  }
}
```

**Response:** No response.

#### `set-working-dir`

Change the working directory for the agent.

**Request:**
```json
{
  "command": "set-working-dir",
  "args": {
    "path": "/workspace/src"
  }
}
```

**Response:** No response.

#### `set-model`

Change the Claude model used by the agent.

**Request:**
```json
{
  "command": "set-model",
  "args": {
    "model": "claude-opus-4"
  }
}
```

**Response:** No response.

#### `set-allowed-tools`

Configure which tools the agent is allowed to use.

**Request:**
```json
{
  "command": "set-allowed-tools",
  "args": {
    "tools": ["Read", "Glob", "Grep", "Write", "Edit", "Bash"]
  }
}
```

**Response:** No response.

#### `save-session`

Save the current session to S3 storage for later restoration.

**Request:**
```json
{
  "command": "save-session",
  "args": {
    "method": "s3"
  }
}
```

**Response:**
```json
{
  "type": "save-session-response",
  "s3Path": "s3://claude-sessions/sessions/session-123.jsonl",
  "sessionId": "session-123"
}
```

**Note:** Session files are stored at `~/.claude/projects/<encoded-cwd>/<session-id>.jsonl` and uploaded to S3. The working directory must match when restoring.

#### `restore-session`

Restore a previously saved session from S3 storage.

**Request:**
```json
{
  "command": "restore-session",
  "args": {
    "sessionId": "session-123",
    "method": "s3"
  }
}
```

**Response:** No response.

---

## Output Messages (Outgoing Messages)

Output messages are sent FROM the chimp. They include both responses to commands and autonomous messages.

All output messages have a `type` field to discriminate between different message types.

### Command Responses

Command responses are sent in reply to specific commands. Only the following commands return responses:

- `send-agent-message` → `agent-message-response`
- `get-status` → `status-response`
- `save-session` → `save-session-response`

All other commands provide feedback via log messages instead of dedicated response types.

### Autonomous Messages

Autonomous messages are sent by the chimp without being prompted by a specific command. These allow the chimp to communicate progress, emit artifacts, or provide logging information.

#### `artifact`

An artifact created by the agent (e.g., file, test result, screenshot).

```json
{
  "type": "artifact",
  "artifactType": "file",
  "name": "user.model.ts",
  "content": "export interface User { ... }",
  "metadata": {
    "path": "/workspace/src/models/user.model.ts",
    "created": "2024-01-01T00:00:00Z"
  }
}
```

**Fields:**
- `artifactType` (string): Type of artifact (e.g., "file", "test-result", "screenshot")
- `name` (string): Name or identifier for the artifact
- `content` (unknown): Artifact content (format depends on artifactType)
- `metadata` (object, optional): Additional metadata about the artifact

#### `progress`

Progress update from the agent.

```json
{
  "type": "progress",
  "message": "Analyzing test suite...",
  "percentage": 45
}
```

**Fields:**
- `message` (string): Human-readable progress message
- `percentage` (number, optional): Progress percentage (0-100)

#### `log`

Log message from the agent.

```json
{
  "type": "log",
  "level": "info",
  "message": "Starting code analysis",
  "timestamp": "2024-01-01T00:00:00Z"
}
```

**Fields:**
- `level` (enum): Log level - "debug", "info", "warn", or "error"
- `message` (string): Log message
- `timestamp` (string): ISO 8601 timestamp

### Error Responses

Errors can be sent in response to any command.

```json
{
  "type": "error",
  "error": "Session not found",
  "command": "resume-session",
  "details": {
    "sessionId": "invalid-session-id",
    "availableSessions": ["session-123", "session-456"]
  }
}
```

**Fields:**
- `error` (string): Error message
- `command` (string, optional): The command that caused the error
- `details` (object, optional): Additional error context

---

## Examples

### Example 1: Simple Agent Interaction

**Input:**
```json
{
  "command": "send-agent-message",
  "args": {
    "prompt": "Write a function to calculate fibonacci numbers"
  }
}
```

**Output:**
```json
{
  "type": "agent-message-response",
  "content": "Here's a function to calculate fibonacci numbers...",
  "sessionId": "session-123"
}
```

### Example 2: Agent with Progress Updates

**Input:**
```json
{
  "command": "send-agent-message",
  "args": {
    "prompt": "Run the full test suite and fix any failures"
  }
}
```

**Output (multiple messages):**
```json
{"type": "progress", "message": "Running test suite...", "percentage": 10}
{"type": "log", "level": "info", "message": "Found 42 tests", "timestamp": "..."}
{"type": "progress", "message": "Analyzing failures...", "percentage": 50}
{"type": "artifact", "artifactType": "test-result", "name": "test-results.json", "content": {...}}
{"type": "progress", "message": "Fixing failures...", "percentage": 75}
{"type": "agent-message-response", "content": "I've fixed all test failures...", "sessionId": "session-123"}
```

### Example 3: Session Forking

**Input 1:**
```json
{
  "command": "send-agent-message",
  "args": {
    "prompt": "Refactor the user authentication system"
  }
}
```

**Output 1:**
```json
{
  "type": "agent-message-response",
  "content": "I'll refactor using JWT tokens...",
  "sessionId": "session-123"
}
```

**Input 2:**
```json
{
  "command": "fork-session"
}
```

**Output 2:**
```json
{
  "type": "fork-session-response",
  "originalSessionId": "session-123",
  "forkedSessionId": "session-456"
}
```

**Input 3:**
```json
{
  "command": "send-agent-message",
  "args": {
    "prompt": "Actually, try using OAuth2 instead"
  }
}
```

**Output 3:**
```json
{
  "type": "agent-message-response",
  "content": "In this forked session, I'll implement OAuth2...",
  "sessionId": "session-456"
}
```

---

## Implementation

The protocol is implemented using Zod schemas with discriminated unions in the `@mnke/circus-protocol` package. See `packages/protocol/index.ts` for TypeScript types and validation functions.

### Usage

```typescript
import {
  parseChimpCommand,
  parseChimpOutputMessage,
  type ChimpCommand,
  type ChimpOutputMessage,
} from '@mnke/circus-protocol';

// Parse incoming command
const command: ChimpCommand = parseChimpCommand(incomingPayload);

// Parse outgoing message
const output: ChimpOutputMessage = parseChimpOutputMessage(outgoingPayload);
```
