# Circus

**Event-driven Claude Agent orchestration platform for Kubernetes**

Circus manages distributed Claude AI agents ("Chimps") across Kubernetes, with event-driven lifecycle management, durable messaging via NATS JetStream, and intelligent session correlation.

## Overview

Circus is a lightweight, event-driven platform for running Claude AI agents at scale. It automatically manages agent lifecycle, routes events from multiple sources (Slack, GitHub, Discord, Jira), and maintains session continuity across distributed agents.

### Key Features

- **Event-Driven Architecture**: Sub-second response times with NATS-based messaging
- **Auto-Scaling**: Agents spin up on-demand and shut down when idle to save resources
- **Multi-Source Support**: Unified event handling for Slack, GitHub, Discord, and Jira
- **Session Continuity**: Automatic correlation of events to existing agent sessions
- **Production-Ready**: Structured logging, error handling, and Kubernetes-native deployment

## Architecture

Circus consists of three main components:

1. **Usher** - Event correlation service that routes webhooks to agent sessions
2. **Ringmaster** - Lifecycle manager that creates/monitors Chimp pods and NATS streams
3. **Chimp** - Claude Agent worker pods that process messages using the Claude Agent SDK

### Data Flow

```
External Event (Slack/GitHub/etc)
  ↓
Usher (correlates to session)
  ↓
NATS JetStream (durable queue)
  ↓
Ringmaster (ensures Chimp is running)
  ↓
Chimp (processes with Claude Agent SDK)
  ↓
Response published to NATS
```

See [ARCHITECTURE.md](./ARCHITECTURE.md) for detailed architecture documentation.

## Quick Start

### Prerequisites

- [Bun](https://bun.sh) runtime (v1.3.11 or later)
- Kubernetes cluster (for production deployment)
- Redis instance
- NATS server with JetStream enabled
- Anthropic API key

### Local Development

1. **Install dependencies**

```bash
bun install
```

2. **Set up environment variables**

Create a `.env` file in each package directory:

```bash
# packages/usher/.env
REDIS_URL=redis://localhost:6379
NATS_URL=nats://localhost:4222
PORT=3000
SLACK_SIGNING_SECRET=your-slack-secret

# packages/ringmaster/.env
REDIS_URL=redis://localhost:6379
NATS_URL=nats://localhost:4222
ANTHROPIC_API_KEY=your-anthropic-key
NAMESPACE=default
CHIMP_IMAGE=circus-chimp:latest

# packages/chimp/.env
ANTHROPIC_API_KEY=your-anthropic-key
NATS_URL=nats://localhost:4222
```

3. **Run services locally**

```bash
# Terminal 1 - Start Usher
cd packages/usher
bun run dev

# Terminal 2 - Start Ringmaster
cd packages/ringmaster
bun run dev
```

4. **Test with a webhook**

```bash
curl -X POST http://localhost:3000/webhooks/test \
  -H "Content-Type: application/json" \
  -d '{"userId": "user123", "content": "Hello, Claude!"}'
```

## Project Structure

```
circus/
├── packages/
│   ├── chimp/         # Claude Agent worker
│   ├── usher/         # Event correlation service
│   ├── ringmaster/    # Lifecycle manager
│   ├── protocol/      # Shared protocol types
│   └── shared/        # Shared utilities (logging, errors)
├── charts/
│   └── circus/        # Helm chart for K8s deployment
├── ARCHITECTURE.md    # Detailed architecture documentation
└── PROTOCOL.md        # Message protocol specification
```

## Packages

- **[@mnke/circus-chimp](./packages/chimp)** - Claude Agent worker that processes messages
- **[@mnke/usher](./packages/usher)** - Event correlation and routing service
- **[@mnke/ringmaster](./packages/ringmaster)** - Pod and stream lifecycle manager
- **[@mnke/circus-protocol](./packages/protocol)** - Message protocol validation (Zod schemas)
- **[@mnke/circus-shared](./packages/shared)** - Shared utilities (Pino logging, error types)

## Deployment

### Kubernetes with Helm

```bash
# Create Anthropic API key secret
kubectl create secret generic anthropic-api-key \
  --from-literal=api-key=YOUR_ANTHROPIC_API_KEY

# Install Circus
helm install circus ./charts/circus
```

See [charts/circus/README.md](./charts/circus/README.md) for detailed deployment instructions.

## Development

### Type Checking

```bash
bun run typecheck
```

### Code Formatting

```bash
bun run format
```

### Building

```bash
bun run build
```

## Documentation

- [ARCHITECTURE.md](./ARCHITECTURE.md) - System architecture and design decisions
- [PROTOCOL.md](./PROTOCOL.md) - Message protocol specification
- [REFACTORING.md](./REFACTORING.md) - Code quality improvements summary

## Technology Stack

- **Runtime**: [Bun](https://bun.sh) - Fast JavaScript runtime
- **Messaging**: [NATS](https://nats.io) JetStream - Durable, distributed messaging
- **State**: Redis - Session state and correlation indexes
- **AI**: [Claude Agent SDK](https://github.com/anthropics/claude-agent-sdk-typescript) - Full Claude Agent with tool access
- **Orchestration**: Kubernetes - Production container orchestration
- **Logging**: Pino - High-performance structured logging

## License

See LICENSE file for details.
