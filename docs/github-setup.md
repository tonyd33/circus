# GitHub App Setup

## Create GitHub App

1. Go to https://github.com/settings/apps (or org settings → Developer settings → GitHub Apps)
2. Click "New GitHub App"
3. Fill in:
   - **App name**: e.g. "Circus Bot"
   - **Homepage URL**: your project URL
   - **Webhook URL**: `https://<your-usher-host>/github/webhook`
   - **Webhook secret**: generate a random string, save for later
4. Permissions:
   - **Issues**: Read & Write (for reactions + comments)
   - **Pull requests**: Read & Write
5. Subscribe to events:
   - **Issue comment**
   - **Pull request review comment**
   - **Issues**
6. Click "Create GitHub App"
7. Note the **App ID** from the app settings page
8. Generate a **private key** (PEM file) — download and save

## Install App on Repository

1. Go to your app's settings page
2. Click "Install App" in sidebar
3. Select the account/org and choose repositories
4. Note the **Installation ID** from the URL: `github.com/settings/installations/{INSTALLATION_ID}`

## Environment Variables

### Usher (webhook ingress)

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_BOT_NAME` | Yes | App name as it appears in @mentions (e.g. `circus-bot`) |
| `GITHUB_PROFILE` | No | Chimp profile to use (default: "default") |
| `GITHUB_WEBHOOK_SECRET` | No | Webhook secret for signature verification (recommended) |
| `GITHUB_APP_ID` | Yes | GitHub App ID (for auto-reactions) |
| `GITHUB_PRIVATE_KEY` | Yes | GitHub App private key PEM (for auto-reactions) |

### Bullhorn (output dispatch)

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_APP_ID` | Yes | GitHub App ID (for posting comments) |
| `GITHUB_PRIVATE_KEY` | Yes | GitHub App private key PEM |

### Chimp profile (for git push / PR creation)

Configure in profile `extraEnv` + `initCommands`:

```json
{
  "extraEnv": [
    { "name": "GITHUB_APP_ID", "valueFrom": { "secretKeyRef": { "name": "circus-secrets", "key": "GITHUB_APP_ID" } } },
    { "name": "GITHUB_PRIVATE_KEY", "valueFrom": { "secretKeyRef": { "name": "circus-secrets", "key": "GITHUB_PRIVATE_KEY" } } },
    { "name": "GITHUB_INSTALLATION_ID", "valueFrom": { "secretKeyRef": { "name": "circus-secrets", "key": "GITHUB_INSTALLATION_ID" } } }
  ],
  "initCommands": [
    { "command": "setup-github-auth" },
    { "command": "gh-clone-repo", "args": { "repo": "owner/repo" } }
  ]
}
```

## Usher Route

```
--route adapter=github,path=/github/webhook
```

## How It Works

1. Someone comments on a PR: `@circus-bot fix the linting errors`
2. GitHub sends webhook to usher
3. Adapter verifies signature, extracts mention and context
4. Usher publishes to event subject: `events.github.{owner}.{repo}.pr.{number}.comment`
5. Ringmaster detects unclaimed event, spawns chimp with topic subscription
6. Chimp processes the request
7. Chimp calls `respond` MCP tool → bullhorn posts comment via GitHub API
8. Chimp can call `subscribe_topic` to receive future events on the same PR

## Supported Events

| Event | Subject Pattern | Trigger |
|-------|----------------|---------|
| Issue comment | `events.github.{owner}.{repo}.{pr\|issue}.{number}.comment` | @mention in issue/PR comment |
| PR review comment | `events.github.{owner}.{repo}.pr.{number}.review_comment` | @mention in PR review comment |
| Issue opened | `events.github.{owner}.{repo}.issue.{number}.opened` | @mention in new issue body |

All events auto-react with 👀 on the triggering comment/issue.

## Webhook Signature Verification

If `GITHUB_WEBHOOK_SECRET` is set, adapter verifies `X-Hub-Signature-256` header using HMAC-SHA256. Recommended for production. Skipped in dev if not set.

## Testing Locally

Use a tunnel (cloudflared, ngrok) to expose usher:

```bash
# Start usher
GITHUB_BOT_NAME=circus-bot GITHUB_APP_ID=123 GITHUB_PRIVATE_KEY="..." \
  bun run packages/usher/src/index.ts --route adapter=github,path=/github/webhook

# Or use the debug adapter for quick testing (no GitHub needed):
curl -X POST http://localhost:7392/debug \
  -H "Content-Type: application/json" \
  -d '{"prompt": "hello", "profile": "default"}'
```
