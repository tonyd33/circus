# Chimp Protocol

This document defines the protocol for communicating with Chimp agents via Conduit exchanges.

The protocol operates in two phases:

1. **Initialization Phase**: Messages from a configuration file processed before connecting to the stream
2. **Runtime Phase**: Messages received from the Conduit exchange stream

Both phases use the same message protocol - the only difference is the delivery mechanism.

## Initialization Configuration

Initialization configuration is provided via a JSON file containing an array of protocol messages. These messages are processed sequentially during chimp startup, before the chimp connects to the Conduit message stream.

### Configuration File Format

```json
{
  "version": "0.1.0",
  "messages": [
    {
      "command": "clone-repo",
      "args": {
        "url": "https://github.com/user/repo.git",
        "branch": "main",
        "path": "/workspace"
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
        "prompt": "Review the recent changes to the authentication module"
      }
    }
  ]
}
```

### Configuration Schema

- `version` (string, required): Protocol version
- `messages` (array, required): Array of protocol messages to process on startup

Each message in the array follows the standard protocol message format (see Message Types below).

### Configuration Location

The chimp looks for initialization configuration in the following locations (in order):

1. Path specified in `CHIMP_CONFIG_PATH` environment variable
2. `/etc/chimp/config.json` (standard mount point)
3. `./chimp.config.json` (current directory)

If no configuration file is found, the chimp starts with default settings and proceeds directly to runtime phase.

### Initialization Sequence

1. **Load configuration** from file (if present)
2. **Validate configuration** structure and protocol version
3. **Process messages sequentially**:
   - Each message is validated using the same protocol schemas as runtime messages
   - Control messages are executed (clone repo, change session mode, etc.)
   - Agent messages are sent to Claude (useful for initial context setting)
   - Responses are logged but not published to the stream
4. **Connect to Conduit** and begin runtime phase

### Example Configurations

#### Clone Repository and Resume Session

```json
{
  "version": "0.1.0",
  "messages": [
    {
      "command": "clone-repo",
      "args": {
        "url": "https://github.com/user/repo.git",
        "branch": "feature-branch"
      }
    },
    {
      "command": "resume-session",
      "args": {
        "sessionId": "existing-session-id"
      }
    }
  ]
}
```

#### Set Working Directory and Provide Initial Context

```json
{
  "version": "0.1.0",
  "messages": [
    {
      "command": "set-working-dir",
      "args": {
        "path": "/workspace/src"
      }
    },
    {
      "command": "send-agent-message",
      "args": {
        "prompt": "You are working on a TypeScript project. Familiarize yourself with the codebase structure."
      }
    }
  ]
}
```

## Message Format

All messages sent to a Chimp worker use a unified format with a command and optional arguments.

### Message Structure

```json
{
  "command": "command-name",
  "args": {
    // command-specific arguments
  }
}
```

#### Fields

- `command` (string, required): The command to execute
- `args` (object, optional): Command-specific arguments

## Commands

### `send-agent-message`

Send a message to the Claude agent for processing.

```json
{
  "command": "send-agent-message",
  "args": {
    "prompt": "Your prompt here"
  }
}
```

**Args:**
- `prompt` (string, required): The prompt to send to the Claude agent

**Response:**
Returns the agent's text response as a string.

**Example:**
```json
{
  "command": "send-agent-message",
  "args": {
    "prompt": "Analyze the authentication module and suggest improvements"
  }
}
```

### Session Management Commands

#### `stop`

Gracefully stop the worker and close the current session.

```json
{
  "command": "stop"
}
```

**Response:**
```json
{
  "status": "stopped",
  "sessionId": "current-session-id"
}
```

#### `new-session`

Start a new session, abandoning the current one.

```json
{
  "command": "new-session"
}
```

**Response:**
```json
{
  "status": "session-created",
  "sessionId": "new-session-id"
}
```

#### `resume-session`

Resume a specific session by ID.

```json
{
  "command": "resume-session",
  "args": {
    "sessionId": "session-id-to-resume"
  }
}
```

**Response:**
```json
{
  "status": "session-resumed",
  "sessionId": "resumed-session-id"
}
```

#### `get-status`

Get the current worker status and session information.

```json
{
  "command": "get-status"
}
```

**Response:**
```json
{
  "status": "running",
  "sessionId": "current-session-id",
  "messageCount": 42,
  "model": "claude-haiku-4-5"
}
```

#### `fork-session`

Fork the current session to explore alternative paths.

```json
{
  "command": "fork-session"
}
```

**Response:**
```json
{
  "status": "session-forked",
  "originalSessionId": "original-session-id",
  "forkedSessionId": "new-forked-session-id"
}
```

### Initialization Commands

#### `clone-repo`

Clone a git repository. Typically used during initialization phase.

```json
{
  "command": "clone-repo",
  "args": {
    "url": "https://github.com/user/repo.git",
    "branch": "main",
    "path": "/workspace"
  }
}
```

**Args:**
- `url` (string, required): Git repository URL to clone
- `branch` (string, optional): Git branch to checkout (default: "main")
- `path` (string, optional): Path where repository should be cloned (default: "/workspace")

**Response:**
```json
{
  "status": "repo-cloned",
  "path": "/workspace",
  "branch": "main"
}
```

#### `set-working-dir`

Change the working directory for the agent.

```json
{
  "command": "set-working-dir",
  "args": {
    "path": "/workspace/src"
  }
}
```

**Args:**
- `path` (string, required): Absolute path to set as working directory

**Response:**
```json
{
  "status": "working-dir-changed",
  "path": "/workspace/src"
}
```

#### `set-model`

Change the Claude model used by the agent.

```json
{
  "command": "set-model",
  "args": {
    "model": "claude-opus-4"
  }
}
```

**Args:**
- `model` (string, required): Claude model identifier

**Response:**
```json
{
  "status": "model-changed",
  "model": "claude-opus-4"
}
```

#### `set-allowed-tools`

Configure which tools the agent is allowed to use.

```json
{
  "command": "set-allowed-tools",
  "args": {
    "tools": ["Read", "Glob", "Grep", "Write", "Edit", "Bash"]
  }
}
```

**Args:**
- `tools` (array[string], required): List of allowed tool names

**Response:**
```json
{
  "status": "tools-configured",
  "tools": ["Read", "Glob", "Grep", "Write", "Edit", "Bash"]
}
```

## Response Format

All responses from the Chimp worker are published as Conduit messages with the following structure:

### Agent Responses

Responses from the Claude agent are published as the text content:

```json
{
  "type": "data",
  "id": "message-id",
  "timestamp": "2024-01-01T00:00:00Z",
  "sequence": 0,
  "payload": "The agent's response text here..."
}
```

### Control Responses

Responses to control commands are published as JSON objects:

```json
{
  "type": "data",
  "id": "message-id",
  "timestamp": "2024-01-01T00:00:00Z",
  "sequence": 0,
  "payload": {
    "status": "session-created",
    "sessionId": "new-session-id"
  }
}
```

### Error Responses

Errors are published with the following format:

```json
{
  "type": "data",
  "id": "message-id",
  "timestamp": "2024-01-01T00:00:00Z",
  "sequence": 0,
  "payload": {
    "error": "Error message here",
    "command": "command-that-failed",
    "sequence": 123
  }
}
```

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
"Here's a function to calculate fibonacci numbers:\n\n```python\ndef fibonacci(n):\n  ..."
```

### Example 2: Multi-turn Conversation

**Input 1:**
```json
{
  "command": "send-agent-message",
  "args": {
    "prompt": "Analyze the user authentication code"
  }
}
```

**Output 1:**
```json
"I've analyzed the authentication code. Here are my findings: ..."
```

**Input 2:**
```json
{
  "command": "send-agent-message",
  "args": {
    "prompt": "Now refactor it to use JWT tokens"
  }
}
```

**Output 2:**
```json
"Based on my previous analysis, here's the refactored code using JWT: ..."
```

### Example 3: Session Management

**Input 1:**
```json
{
  "command": "send-agent-message",
  "args": {
    "prompt": "Help me debug this API endpoint"
  }
}
```

**Output 1:**
```json
"Let me analyze the API endpoint. I found several issues: ..."
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
  "status": "session-forked",
  "originalSessionId": "abc-123",
  "forkedSessionId": "def-456"
}
```

**Input 3:**
```json
{
  "command": "send-agent-message",
  "args": {
    "prompt": "Try a different approach using caching"
  }
}
```

**Output 3:**
```json
"In this forked session, let me try a caching approach: ..."
```

## Protocol Version

Current version: `0.1.0`

Future versions may add new control commands or message fields while maintaining backward compatibility with existing commands.

## Implementation

The protocol is implemented using Zod schemas in the `chimp-protocol` package. See `packages/chimp-protocol/index.ts` for TypeScript types and validation functions.
