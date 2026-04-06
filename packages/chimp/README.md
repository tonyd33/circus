# conduit-chimp

A Claude Agent integration for the Conduit Kubernetes operator. This application connects Claude's AI agent capabilities (with access to file operations, bash commands, etc.) to NATS JetStream via Conduit exchanges, enabling AI-powered message processing in a distributed system.

## Overview

Conduit Chimp receives messages from a NATS JetStream (managed by the Conduit operator), processes them using the Claude Agent SDK, and publishes responses back. It automatically checkpoints state for recovery and handles shutdown gracefully.

## Features

- **Claude Agent SDK Integration**: Uses the full Claude Agent SDK with access to file operations, bash commands, and other tools
- **Checkpointing**: Automatically saves state every 5 messages for recovery
- **Error Handling**: Graceful error handling with error responses published back to the stream
- **Signal Handling**: Proper shutdown on SIGINT/SIGTERM with state preservation

## Prerequisites

- [Bun](https://bun.sh) runtime
- Anthropic API key
- NATS JetStream instance (for local development)
- Access to the Conduit operator (for production deployment in Kubernetes)

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

### Conduit Variables

When running in Kubernetes with the Conduit operator, these are automatically injected. For local development, set them manually:

- `EXCHANGE_ID`: Unique exchange identifier
- `EXCHANGE_NAME`: Name of the exchange
- `EXCHANGE_NAMESPACE`: Kubernetes namespace
- `NATS_URL`: NATS server connection URL (e.g., `nats://localhost:4222`)
- `NATS_STREAM_NAME`: JetStream stream name
- `NATS_CONSUMER_NAME`: Consumer name
- `NATS_SUBJECT_INPUT`: Input subject for receiving messages (e.g., `chimp.input`)
- `NATS_SUBJECT_OUTPUT`: Output subject for publishing responses (e.g., `chimp.output`)
- `NATS_SUBJECT_CONTROL`: Control message subject (e.g., `chimp.control`)

### Optional Variables

- `IN_CLUSTER`: Set to `false` for local development (default: `true`)
- `IS_RECOVERING`: Whether recovering from checkpoint (default: `false`)
- `CHECKPOINT_DATA`: JSON checkpoint data for recovery

## Message Format

### Input Messages

The Conduit SDK expects messages in the following envelope format:

```json
{
  "type": "data",
  "id": "unique-message-id",
  "timestamp": "2024-01-01T00:00:00Z",
  "sequence": 1,
  "payload": "Your prompt here"
}
```

The `payload` field can be:

```json
// Simple string
"What is the capital of France?"

// Object with prompt field
{
  "prompt": "What is the capital of France?"
}

// Any JSON object (will be stringified)
{
  "question": "What is the capital of France?",
  "context": "I'm learning geography"
}
```

### Output Messages

Responses are published as a Conduit message envelope:

```json
{
  "type": "data",
  "id": "response-message-id",
  "timestamp": "2024-01-01T00:00:01Z",
  "sequence": 0,
  "payload": "The capital of France is Paris..."
}
```

### Error Messages

On error, the following format is used:

```json
{
  "type": "data",
  "id": "error-message-id",
  "timestamp": "2024-01-01T00:00:01Z",
  "sequence": 0,
  "payload": {
    "error": "Error message here",
    "sequence": 123,
    "timestamp": "2024-01-01T00:00:01Z"
  }
}
```

## State Management

The application maintains state including:

- `messageCount`: Total number of messages processed

State is automatically checkpointed every 5 messages and can be recovered if the application restarts.

## Production Deployment with Conduit

To deploy with the Conduit operator, create an Exchange resource:

```yaml
apiVersion: conduit.mnke.io/v1alpha1
kind: Exchange
metadata:
  name: conduit-chimp
  namespace: default
spec:
  image: your-registry/conduit-chimp:latest
  env:
    - name: ANTHROPIC_API_KEY
      valueFrom:
        secretKeyRef:
          name: anthropic-secret
          key: api-key
  resources:
    requests:
      memory: "256Mi"
      cpu: "100m"
    limits:
      memory: "512Mi"
      cpu: "500m"
```

Create the Anthropic API key secret:

```bash
kubectl create secret generic anthropic-secret \
  --from-literal=api-key=your_api_key_here
```

Apply the Exchange:

```bash
kubectl apply -f exchange.yaml
```

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

## Built With

- [Bun](https://bun.com) - Fast JavaScript runtime
- [Conduit SDK](https://github.com/tonyd33/conduit/tree/master/sdk/typescript) - TypeScript SDK for Conduit exchanges
- [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript) - Official Claude Agent SDK with full tool access

## License

See the main repository for license information.
