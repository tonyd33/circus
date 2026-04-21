# Discord App Setup

## Create Application

1. Go to https://discord.com/developers/applications
2. Click "New Application", name it (e.g. "Circus")
3. Note the **Application ID** and **Public Key** from General Information

## Configure Interactions Endpoint

1. In your app settings, go to "General Information"
2. Set **Interactions Endpoint URL** to: `https://<your-usher-host>/discord/webhook`
3. Discord will verify the endpoint with a PING — usher handles this automatically

## Register Slash Command

Use the Discord API to register the `/circus` command:

```bash
curl -X POST \
  "https://discord.com/api/v10/applications/<APPLICATION_ID>/commands" \
  -H "Authorization: Bot <BOT_TOKEN>" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "chimp",
    "description": "Send a message to a circus chimp",
    "options": [
      {
        "name": "prompt",
        "type": 3,
        "description": "What to do",
        "required": true
      }
    ]
  }'
```

## Add Bot to Server

1. Go to "OAuth2" in app settings
2. Under "OAuth2 URL Generator", select scopes: `bot`, `applications.commands`
3. Select bot permissions: Send Messages
4. Use generated URL to invite bot to your server

## Environment Variables

Set these on the usher service:

| Variable | Required | Description |
|----------|----------|-------------|
| `DISCORD_PUBLIC_KEY` | Yes | From app's General Information page |
| `DISCORD_APPLICATION_ID` | Yes | From app's General Information page |
| `DISCORD_PROFILE` | No | Chimp profile to use (default: "default") |

## Usher Route

```
--route adapter=discord,path=/discord/webhook
```

## How It Works

1. User types `/circus fix the login bug` in Discord
2. Discord POSTs interaction to usher endpoint
3. Usher verifies signature, returns deferred ack (shows "thinking...")
4. Usher publishes to event subject: `events.discord.{guild}.{channel}.message`
5. Ringmaster detects unclaimed event, spawns chimp
6. Chimp processes, calls `respond` MCP tool with result
7. MCP publishes `discord-response` output
8. Bullhorn PATCHes Discord webhook to update the deferred message

Chimps can call `subscribe_topic` to receive future events from other platforms (e.g. GitHub PR comments) for cross-platform continuity.
