# Chimp Protocol

This document defines the protocol for communicating with Chimp agents via Conduit exchanges.

The protocol distinguishes between:
1. **Commands** - Messages sent TO the chimp (incoming)
2. **Output Messages** - Messages sent FROM the chimp (outgoing)

Output messages include both **responses to commands** and **autonomous messages** that the chimp can emit on its own (like progress updates, logs, or artifacts).

## Protocol Version

Current version: `0.1.0`

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
