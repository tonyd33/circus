# @mnke/usher

**Event correlation service for the Circus platform**

Usher receives webhooks from multiple sources (Slack, GitHub, Discord, Jira), correlates them to Chimp sessions using intelligent routing, and publishes messages to NATS JetStream. It's the entry point for all external events into the Circus platform.

## Features

- **Sub-Second Correlation**: Redis-backed lookups with <100ms typical latency
- **Intelligent Session Routing**: Thread-aware, user-aware, and resource-aware correlation
- **Durable Sessions**: 30-minute TTL with automatic refresh on activity
- **Bidirectional Correlation**: Tracks resources created by Chimps (PRs, issues, threads)
- **Multiple Event Sources**: Slack (implemented), GitHub/Discord/Jira (ready to add)
- **Stream Management**: Idempotent NATS stream/consumer creation
- **Production-Ready**: Structured logging (Pino), error handling, and health checks

## Architecture

```
Webhooks → Usher → Redis (Session Store) → Correlator → NATS JetStream
            ↓                                              ↓
    Correlation Events ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← ← Chimps
         (chimp.*.correlation)
```

### Correlation Strategy

The correlator uses a hierarchy of lookups (stops at first match):

1. **Exact match** on thread ID (Slack/Discord threads)
2. **Exact match** on issue key (GitHub/Jira issues)
3. **Exact match** on PR number (GitHub pull requests)
4. **Channel match** (for messages without threads)
5. **User's recent session** (within 5 minutes)
6. **Create new session**

All lookups are O(1) Redis operations.

### Bidirectional Correlation

When a Chimp creates external resources (PRs, issues, threads), it publishes correlation events:

```
Chimp creates PR #123 → chimp.{name}.correlation → Usher updates Redis
                                                     ↓
                                    github:pr:myorg/myrepo:123 → {chimpName}
```

This allows future comments on that PR to automatically route back to the same Chimp.

## Configuration

### Environment Variables

**Required:**
- `NATS_URL`: NATS server URL (default: `nats://localhost:4222`)
- `REDIS_URL`: Redis server URL (default: `redis://localhost:6379`)

**Optional:**
- `PORT`: HTTP server port (default: `3000`)

**Webhook Secrets (for verification):**
- `SLACK_SIGNING_SECRET`: Slack webhook signing secret
- `GITHUB_WEBHOOK_SECRET`: GitHub webhook secret (coming soon)
- `DISCORD_WEBHOOK_TOKEN`: Discord webhook token (coming soon)
- `JIRA_WEBHOOK_SECRET`: Jira webhook secret (coming soon)

## Running

### Development

```bash
# Set up environment
export REDIS_URL=redis://localhost:6379
export NATS_URL=nats://localhost:4222
export PORT=3000

# Run with auto-reload
bun run dev

# Or run directly
bun index.ts
```

### Production

```bash
bun run start
```

### Building

```bash
bun run build
```

## Webhook Endpoints

### Slack

**Endpoint:** `POST /webhooks/slack`

Supports:
- Message events
- App mention events
- Slash commands
- Interactive components (buttons, modals)

**Setup:**
1. Create a Slack App at https://api.slack.com/apps
2. Enable Event Subscriptions
3. Set Request URL to `https://your-domain/webhooks/slack`
4. Subscribe to bot events: `message.channels`, `app_mention`
5. Install app to workspace
6. Set `SLACK_SIGNING_SECRET` environment variable

### Test Endpoint

**Endpoint:** `POST /webhooks/test`

A simple test endpoint for development and debugging:

```bash
curl -X POST http://localhost:3000/webhooks/test \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "user123",
    "content": "Hello, Claude!",
    "identifiers": {
      "channelId": "test-channel",
      "threadId": "test-thread"
    }
  }'
```

Returns:
```json
{
  "success": true,
  "event": {
    "source": "test",
    "eventType": "message",
    "content": "Hello, Claude!"
  }
}
```

### GitHub (Coming Soon)

**Endpoint:** `POST /webhooks/github`

Will support:
- Pull request comments
- Issue comments
- Pull request reviews
- Issue updates

Adapter stub is ready in `adapters/github.ts`.

### Discord (Coming Soon)

**Endpoint:** `POST /webhooks/discord`

Will support:
- Message events
- Thread messages
- Mentions

Adapter stub is ready in `adapters/discord.ts`.

### Jira (Coming Soon)

**Endpoint:** `POST /webhooks/jira`

Will support:
- Issue updates
- Comments
- Status changes

Adapter stub is ready in `adapters/jira.ts`.

### Health Check

**Endpoint:** `GET /healthz`

Returns `200 OK` when service is healthy.

## Session Management

### Session Format

Sessions are stored in Redis with the following structure:

```
session:{chimpName} → Hash {
  chimpName: string
  source: "slack" | "github" | "discord" | "jira"
  identifiers: JSON
  userId: string
  createdAt: timestamp
  lastActivityAt: timestamp
  state: "active" | "idle"
}
TTL: 30 minutes
```

### Correlation Indexes

Redis keys updated by correlation events from Chimps:

- `github:pr:{repo}:{prNumber}` → chimpName
- `github:issue:{repo}:{issueNumber}` → chimpName
- `jira:issue:{issueKey}` → chimpName
- `slack:thread:{threadTs}` → chimpName
- `discord:thread:{threadId}` → chimpName
- `user:recent:{userId}` → chimpName

All with 30 minute TTL.

### Chimp Naming

Chimp names are generated from event identifiers:

- Slack thread: `slack-{channelId}-{threadId}`
- GitHub issue: `github-{issueKey}`
- GitHub PR: `github-{owner}-{repo}-pr-{number}`
- Slack channel: `slack-{channelId}`
- Discord thread: `discord-{channelId}-{threadId}`

## Performance

### Targets

- **Event processing**: < 1 second total
- **Correlation**: < 50ms
- **Redis lookup**: < 10ms (typically 1-2ms)
- **NATS publish**: < 100ms

### Monitoring

The service logs processing times for each step:

```
[Usher] Event correlated to session slack-C123-T456 (new: false) in 12ms
[Usher] Message published to chimp.slack-C123-T456.input in 8ms
[Usher] Total processing time: 20ms
```

Warnings are logged if total time exceeds 1 second.

## Message Format

Messages published to `chimp.{chimpName}.input` use the Circus protocol:

```json
{
  "command": "send-agent-message",
  "args": {
    "prompt": "User message content here"
  }
}
```

## Development

### Adding a New Event Source

1. Create an adapter in `adapters/{source}.ts`:

```typescript
export function normalizeYourEvent(payload: any): NormalizedEvent | null {
  return {
    source: "yoursource",
    eventType: "message",
    identifiers: {
      // Your source-specific IDs
    },
    userId: "...",
    content: "...",
    raw: payload,
  };
}
```

2. Add webhook endpoint in `index.ts`:

```typescript
if (url.pathname === "/webhooks/yoursource" && req.method === "POST") {
  const normalized = normalizeYourEvent(payload);
  if (normalized) {
    service.processEvent(normalized);
  }
  return new Response("OK");
}
```

3. Update types in `types.ts` if needed.

### Testing

```bash
# Run type checking
bun typecheck

# Manual testing with curl
curl -X POST http://localhost:3000/webhooks/slack \
  -H "Content-Type: application/json" \
  -d '{"type":"url_verification","challenge":"test"}'
```

## Session Correlation Logic

Usher uses a hierarchical correlation strategy (first match wins):

1. **Thread ID** - Exact match on thread timestamp (Slack/Discord)
2. **Issue/PR ID** - Exact match on resource identifier (GitHub/Jira)
3. **Channel ID** - Match on channel for non-threaded messages
4. **Recent User Session** - User's most recent session (within 5 minutes)
5. **New Session** - Create new session with generated name

All lookups are O(1) Redis operations.

### Chimp Naming Convention

Session names (which become Chimp names) are generated as:

- Slack thread: `slack-{channelId}-{threadTs}`
- Slack channel: `slack-{channelId}`
- GitHub PR: `github-{owner}-{repo}-pr-{number}`
- GitHub issue: `github-{owner}-{repo}-issue-{number}`
- Jira issue: `jira-{issueKey}`
- Discord thread: `discord-{channelId}-{threadId}`

## Dependencies

- **nats**: NATS client for JetStream publishing
- **ioredis**: Redis client for session/correlation storage
- **@mnke/circus-shared**: Shared utilities (logging, error handling)

## Development

### Adding a New Event Source

1. Create adapter in `adapters/{source}.ts`:

```typescript
import type { NormalizedEvent } from "../types.ts";

export function normalizeYourEvent(payload: any): NormalizedEvent | null {
  // Validate payload
  if (!payload.someField) {
    return null;
  }

  return {
    source: "yoursource",
    eventType: "message",
    identifiers: {
      // Source-specific identifiers
      resourceId: payload.id,
    },
    userId: payload.user.id,
    content: payload.text,
    raw: payload,
  };
}
```

2. Add webhook endpoint in `index.ts`:

```typescript
if (url.pathname === "/webhooks/yoursource" && req.method === "POST") {
  const payload = await req.json();
  const normalized = normalizeYourEvent(payload);

  if (normalized) {
    service.processEvent(normalized).catch((error) => {
      logger.error({ err: error }, "Failed to process event");
    });
  }

  return new Response("OK", { status: 200 });
}
```

3. Update correlation logic in `correlator.ts` if needed for source-specific routing.

### Type Checking

```bash
bun run typecheck
```

## Related Documentation

- [Main Circus README](../../README.md)
- [Architecture Documentation](../../ARCHITECTURE.md)
- [Protocol Specification](../../PROTOCOL.md)

## License

See the main repository for license information.
