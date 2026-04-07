# Usher

**The Usher guides events from various sources to their appropriate Chimp sessions.**

Usher is an event correlation service that receives webhooks from multiple sources (GitHub, Jira, Slack, Discord, etc.), correlates them to sessions, and publishes messages directly to NATS subjects for Chimps to process.

## Features

- **Fast Correlation** (<1s, typically 100-200ms): Redis-backed session lookups
- **Durable Sessions**: Sessions persist across restarts in Redis
- **Direct NATS Publishing**: No intermediary layers, messages go directly to JetStream
- **Bidirectional Correlation**: Tracks external resources created by Chimps
- **Multiple Event Sources**: Slack, GitHub, Discord, Jira (extensible)
- **Session = Chimp Name**: Simple 1:1 mapping

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

```bash
# NATS
NATS_URL=nats://nats:4222

# Redis
REDIS_URL=redis://redis:6379

# Webhooks
SLACK_SIGNING_SECRET=your-slack-signing-secret
GITHUB_WEBHOOK_SECRET=your-github-webhook-secret
DISCORD_WEBHOOK_TOKEN=your-discord-webhook-token
JIRA_WEBHOOK_SECRET=your-jira-webhook-secret

# Server
PORT=3000
```

## Running

### Development

```bash
bun --watch index.ts
```

### Production

```bash
bun start
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

### GitHub (Coming Soon)

**Endpoint:** `POST /webhooks/github`

Will support:
- Pull request comments
- Issue comments
- Pull request reviews
- Issue updates

### Discord (Coming Soon)

**Endpoint:** `POST /webhooks/discord`

Will support:
- Message events
- Thread messages
- Mentions

### Jira (Coming Soon)

**Endpoint:** `POST /webhooks/jira`

Will support:
- Issue updates
- Comments
- Status changes

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

## Dependencies

- **nats**: NATS client for direct JetStream publishing
- **Bun.redis**: Redis client for session storage

## Architecture Decisions

### Why Direct NATS Publishing?

- Eliminates intermediary layers (no Exchange CRD)
- Faster message delivery (no operator reconciliation)
- Simpler architecture (fewer moving parts)
- Better scalability (direct pub/sub)

### Why Redis?

- Fast O(1) lookups for correlation
- Survives service restarts
- TTL support for automatic cleanup
- Supports multiple Usher instances (horizontal scaling)

### Why Bidirectional Correlation?

- Enables seamless cross-platform workflows
- Chimp creates PR on GitHub → User comments on GitHub → Routes back to same Chimp
- No manual session management required
