# @mnke/circus-chimp

A Claude Agent worker for the Circus platform. Chimp connects to NATS JetStream, processes messages using the Claude Agent SDK (with full tool access), and publishes responses back. It implements heartbeat monitoring, idle timeout, and session persistence.

## Overview

Chimp is the worker component of Circus that executes Claude AI agent tasks. Each Chimp runs as a dedicated Kubernetes pod, processing messages from its own NATS stream with full access to file operations, bash commands, and other Claude tools.

## Features

- **Claude Agent SDK Integration**: Full Claude Agent SDK with tool access (Read, Write, Edit, Glob, Grep, Bash)
- **Session Continuity**: Maintains session state across messages using Claude's session system
- **Heartbeat Monitoring**: Publishes heartbeats every 10 seconds for health tracking
- **Idle Timeout**: Automatically shuts down after 30 minutes of inactivity to save resources
- **Correlation Events**: Publishes events when creating external resources (PRs, issues, threads)
- **S3 Session Persistence**: Save and restore Claude sessions to/from S3 (MinIO)
- **Configurable**: Model, tools, and working directory configurable via environment variables
- **Error Handling**: Graceful error handling with structured error responses
- **Signal Handling**: Proper shutdown on SIGINT/SIGTERM with completion events

## Prerequisites

- [Bun](https://bun.sh) runtime (v1.3.11 or later)
- Anthropic API key
- NATS server with JetStream enabled
- (Optional) S3/MinIO instance for session persistence
- Kubernetes cluster (for production deployment)

## Local Development Setup

### 1. Install NATS Server

Install NATS with JetStream support:

```bash
# macOS
brew install nats-server

# Linux
curl -L https://github.com/nats-io/nats-server/releases/download/v2.10.7/nats-server-v2.10.7-linux-amd64.tar.gz | tar xz
sudo mv nats-server-v2.10.7-linux-amd64/nats-server /usr/local/bin/

# Or use Docker
docker run -p 4222:4222 -p 8222:8222 nats:latest -js
```

### 2. Start NATS Server

Start NATS with JetStream enabled:

```bash
nats-server -js
```

Or with Docker:

```bash
docker run -d --name nats -p 4222:4222 -p 8222:8222 nats:latest -js
```

### 3. Create JetStream Stream and Consumer

Install the NATS CLI:

```bash
# macOS
brew install nats-io/nats-tools/nats

# Linux
curl -sf https://binaries.nats.dev/nats-io/natscli/nats@latest | sh

# Or use Docker
alias nats="docker run --rm -it --network host natsio/nats-box:latest nats"
```

Create a stream for the exchange:

```bash
# Create a stream
nats stream add CHIMP_STREAM \
  --subjects "chimp.input,chimp.output,chimp.control" \
  --storage file \
  --retention limits \
  --max-msgs=-1 \
  --max-age=24h \
  --max-bytes=-1 \
  --discard old
```

Create a consumer:

```bash
# Create a durable consumer
nats consumer add CHIMP_STREAM CHIMP_CONSUMER \
  --filter "chimp.input" \
  --ack explicit \
  --pull \
  --deliver all \
  --max-deliver=-1 \
  --wait=30s
```

### 4. Configure Environment Variables

Create a `.env` file in the project root:

```bash
# Claude Agent SDK
ANTHROPIC_API_KEY=your_api_key_here

# Conduit Exchange Configuration (for local dev)
EXCHANGE_ID=local-dev-chimp
EXCHANGE_NAME=conduit-chimp
EXCHANGE_NAMESPACE=default

# NATS Configuration
NATS_URL=nats://localhost:4222
NATS_STREAM_NAME=CHIMP_STREAM
NATS_CONSUMER_NAME=CHIMP_CONSUMER
NATS_SUBJECT_INPUT=chimp.input
NATS_SUBJECT_OUTPUT=chimp.output
NATS_SUBJECT_CONTROL=chimp.control
```

### 5. Install Dependencies and Run

```bash
bun install
bun run dev
```

### 6. Test Locally

In another terminal, publish a test message:

```bash
# Publish a test message
nats pub chimp.input '{"type":"data","id":"test-1","timestamp":"2024-01-01T00:00:00Z","sequence":1,"payload":{"command": "send-agent-message", "args":{"prompt": "Hello Claude! Can you help me write a function to calculate fibonacci numbers?"}}}'

# Subscribe to responses
nats sub chimp.output
```

## Configuration

### Required Variables

- `ANTHROPIC_API_KEY`: Your Anthropic API key
- `CHIMP_NAME`: Unique identifier for this Chimp instance (e.g., `slack-C123-T456`)

### NATS Configuration

- `NATS_URL`: NATS server connection URL (default: `nats://localhost:4222`)

Stream and consumer names are automatically derived from `CHIMP_NAME`:
- Stream: `chimp-{CHIMP_NAME}`
- Consumer: `chimp-{CHIMP_NAME}-consumer`
- Subjects: `chimp.{CHIMP_NAME}.{input|output|control|correlation|heartbeat}`

### Optional Variables

#### Claude Configuration
- `CLAUDE_MODEL`: Claude model to use (default: `claude-sonnet-4-5`)
- `ALLOWED_TOOLS`: Comma-separated list of allowed tools (default: `Read,Glob,Grep,Write,Edit,Bash`)
- `WORKING_DIR`: Initial working directory (default: current directory)

#### Lifecycle Configuration
- `IDLE_TIMEOUT_MS`: Milliseconds of inactivity before shutdown (default: `1800000` = 30 minutes)

#### S3/MinIO Configuration (for session persistence)
- `S3_ENDPOINT`: S3 endpoint URL (default: `http://minio:9000`)
- `S3_REGION`: S3 region (default: `us-east-1`)
- `S3_ACCESS_KEY_ID`: S3 access key (default: `minioadmin`)
- `S3_SECRET_ACCESS_KEY`: S3 secret key (default: `minioadmin`)
- `S3_BUCKET`: S3 bucket for sessions (default: `claude-sessions`)

## Message Protocol

Chimp uses the Circus protocol (defined in `@mnke/circus-protocol`). All messages are JSON.

### Input Messages (chimp.{name}.input)

```json
{
  "command": "send-agent-message",
  "args": {
    "prompt": "Your message to Claude here"
  }
}
```

Other commands:
- `get-status` - Get current Chimp status
- `new-session` - Start a new session on next message
- `stop` - Shut down the Chimp
- `clone-repo` - Clone a git repository
- `set-working-dir` - Change working directory
- `set-model` - Change Claude model
- `set-allowed-tools` - Update allowed tools
- `save-session` - Save session to S3
- `restore-session` - Restore session from S3

See [PROTOCOL.md](../../PROTOCOL.md) for full protocol specification.

### Output Messages (chimp.{name}.output)

**Agent Response:**
```json
{
  "type": "agent-message",
  "content": "Claude's response text",
  "sessionId": "session-abc-123"
}
```

**Log Message:**
```json
{
  "type": "log",
  "level": "info",
  "message": "Processing started"
}
```

**Error Response:**
```json
{
  "type": "error",
  "error": "Error message",
  "metadata": {
    "sequence": "123",
    "timestamp": "2024-01-01T00:00:00Z"
  }
}
```

### Control Messages (chimp.{name}.control)

**Completion Event** (published on shutdown):
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

### Heartbeat Messages (chimp.{name}.heartbeat)

Published every 10 seconds:
```json
{
  "chimpName": "slack-C123-T456",
  "timestamp": 1234567890000,
  "messageCount": 42
}
```

### Correlation Events (chimp.{name}.correlation)

Published when creating external resources:
```json
{
  "type": "github-pr",
  "repo": "owner/repo",
  "prNumber": 123,
  "sessionName": "slack-C123-T456",
  "timestamp": 1234567890000
}
```

## Lifecycle

Chimps follow an ephemeral lifecycle to conserve resources:

1. **Creation**: Ringmaster creates Chimp pod when messages arrive
2. **Running**: Processes messages and publishes heartbeats every 10 seconds
3. **Idle Detection**: After 30 minutes (configurable) with no messages, publishes completion event
4. **Shutdown**: Exits gracefully, allowing Kubernetes to clean up the pod
5. **Recreation**: If new messages arrive, Ringmaster creates a new pod

Messages are safely buffered in NATS JetStream during downtime.

## Session Persistence

Chimp maintains Claude session state across messages for continuity.

### Local Session Files

Sessions are stored locally at:
```
~/.claude/projects/<encoded-cwd>/<session-id>.jsonl
```

Where `<encoded-cwd>` is the working directory path with non-alphanumeric chars replaced by `-`.

### S3 Persistence

Use `save-session` and `restore-session` commands to persist sessions to S3/MinIO:

```bash
# Save session
nats pub chimp.mychimp.input '{"command":"save-session"}'

# Restore session
nats pub chimp.mychimp.input '{"command":"restore-session","args":{"sessionId":"session-abc-123"}}'
```

This allows session continuity across pod restarts.

## Production Deployment

Chimps are typically deployed by Ringmaster in response to incoming messages. Manual deployment:

```bash
kubectl create secret generic anthropic-api-key \
  --from-literal=api-key=your_anthropic_api_key

kubectl run chimp-test \
  --image=circus-chimp:latest \
  --env="ANTHROPIC_API_KEY=$(kubectl get secret anthropic-api-key -o jsonpath='{.data.api-key}' | base64 -d)" \
  --env="CHIMP_NAME=test-chimp" \
  --env="NATS_URL=nats://nats:4222"
```

See the main Circus documentation for full deployment instructions.

## Debugging

### View NATS Streams

```bash
# List streams
nats stream ls

# View stream info
nats stream info CHIMP_STREAM

# View messages in stream
nats stream view CHIMP_STREAM
```

### View NATS Consumers

```bash
# List consumers
nats consumer ls CHIMP_STREAM

# View consumer info
nats consumer info CHIMP_STREAM CHIMP_CONSUMER
```

### Monitor Messages

```bash
# Subscribe to input messages
nats sub chimp.input

# Subscribe to output messages
nats sub chimp.output

# View all messages on subjects
nats sub "chimp.>"
```

### Delete Stream and Consumer (for cleanup)

```bash
# Delete consumer
nats consumer rm CHIMP_STREAM CHIMP_CONSUMER

# Delete stream
nats stream rm CHIMP_STREAM
```

## Development

### Running Locally

```bash
# Set environment variables
export ANTHROPIC_API_KEY=your_key
export CHIMP_NAME=test-chimp
export NATS_URL=nats://localhost:4222

# Run with auto-reload
bun run dev

# Or run directly
bun index.ts
```

### Building

```bash
bun run build
```

This creates a standalone `index.js` file that can be deployed to Kubernetes.

### Type Checking

```bash
bun run typecheck
```

## Built With

- [Bun](https://bun.com) - Fast JavaScript runtime
- [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript) - Official Claude Agent SDK with full tool access
- [NATS](https://nats.io) - Distributed messaging system
- [@mnke/circus-protocol](../protocol) - Message protocol validation
- [@mnke/circus-shared](../shared) - Shared utilities (logging, errors)

## Related Documentation

- [Main Circus README](../../README.md)
- [Architecture Documentation](../../ARCHITECTURE.md)
- [Protocol Specification](../../PROTOCOL.md)

## License

See the main repository for license information.
