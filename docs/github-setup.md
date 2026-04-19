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
   - **Issues**: Read
   - **Pull requests**: Read & Write
   - **Issue comments**: Read & Write (under Issues)
5. Subscribe to events:
   - **Issue comment**
6. Click "Create GitHub App"
7. Note the **App ID** from the app settings page

## Install App on Repository

1. Go to your app's settings page
2. Click "Install App" in sidebar
3. Select the account/org and choose repositories

## Environment Variables

Set these on the usher service:

| Variable | Required | Description |
|----------|----------|-------------|
| `GITHUB_BOT_NAME` | Yes | App name as it appears in @mentions (e.g. `circus-bot`) |
| `GITHUB_PROFILE` | No | Chimp profile to use (default: "default") |
| `GITHUB_WEBHOOK_SECRET` | No | Webhook secret for signature verification (recommended) |

## Usher Route

```
--route adapter=github,path=/github/webhook
```

## How It Works

1. Someone comments on a PR: `@circus-bot fix the linting errors`
2. GitHub sends `issue_comment` webhook to usher
3. Adapter verifies signature, extracts mention and context
4. Publishes `send-agent-message` to NATS with GitHub context (repo, PR number, comment ID)
5. Chimp processes the request
6. ChimpId is deterministic: `gh-{owner}-{repo}-pr-{number}` — same PR always routes to same chimp

## Supported Events

Currently: `issue_comment` (created) with @mention detection.

PR comments and issue comments both handled. Adapter checks for `pull_request` field to distinguish.

## Webhook Signature Verification

If `GITHUB_WEBHOOK_SECRET` is set, adapter verifies `X-Hub-Signature-256` header using HMAC-SHA256. Recommended for production. Skipped in dev if not set.

## Testing Locally

Use a tunnel (ngrok, cloudflared) to expose usher:

```bash
# Start usher
GITHUB_BOT_NAME=circus-bot bun run packages/usher/src/index.ts --route adapter=github,path=/github/webhook

# In another terminal
ngrok http 7392
```

Set the ngrok URL as webhook URL in GitHub App settings. Comment on a PR with `@circus-bot hello` to test.

Or test directly with curl:

```bash
curl -X POST http://localhost:7392/github/webhook \
  -H "Content-Type: application/json" \
  -d '{
    "action": "created",
    "comment": {
      "id": 1,
      "body": "@circus-bot fix the bug",
      "user": { "login": "testuser" }
    },
    "issue": {
      "number": 42,
      "pull_request": { "url": "https://api.github.com/repos/owner/repo/pulls/42" }
    },
    "repository": {
      "full_name": "owner/repo"
    }
  }'
```
