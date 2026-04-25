# Circus Helm Chart

This Helm chart deploys the Circus event-driven AI Agent orchestration platform on Kubernetes.

## Components

The chart deploys the following components:

- **NATS** - Message broker with JetStream for durable messaging
- **Redis** - Session state and correlation indexes
- **MinIO** - Object storage for agent session persistence
- **Ringmaster** - Lifecycle manager for Chimp pods and NATS streams
- **Usher** - Event correlation service for webhooks
- **Chimp** - (Dynamic) AI Agent worker pods created on-demand

## Prerequisites

- Kubernetes 1.19+
- Helm 3.0+
- AI Agent API credentials (e.g., Anthropic API key for Claude Agent SDK)
- (Optional) Slack/GitHub/Discord/Jira for webhook integration

## Installation

### 1. Create the Anthropic API key secret

Before installing the chart, create a Kubernetes secret containing your Anthropic API key:

```bash
kubectl create secret generic anthropic-api-key \
  --from-literal=api-key=YOUR_ANTHROPIC_API_KEY
```

Alternatively, you can set the API key in the values file (not recommended for production):

```bash
helm install circus ./charts/circus \
  --set secrets.anthropicApiKey.value="YOUR_ANTHROPIC_API_KEY"
```

### 2. Install the chart

```bash
helm install circus ./charts/circus
```

Or with custom values:

```bash
helm install circus ./charts/circus -f custom-values.yaml
```

## Configuration

### Key Configuration Options

| Parameter                     | Description                  | Default               |
|-------------------------------|------------------------------|-----------------------|
| `nats.enabled`                | Enable NATS deployment       | `true`                |
| `nats.image.tag`              | NATS image tag               | `2.10-alpine`         |
| `redis.enabled`               | Enable Redis deployment      | `true`                |
| `redis.image.tag`             | Redis image tag              | `7-alpine`            |
| `minio.enabled`               | Enable MinIO deployment      | `true`                |
| `minio.auth.rootUser`         | MinIO root username          | `minioadmin`          |
| `minio.auth.rootPassword`     | MinIO root password          | `minioadmin`          |
| `ringmaster.enabled`          | Enable Ringmaster deployment | `true`                |
| `ringmaster.image.repository` | Ringmaster image             | `circus-ringmaster`   |
| `ringmaster.env.chimpImage`   | Chimp worker image           | `circus-chimp:latest` |
| `usher.enabled`               | Enable Usher deployment      | `true`                |
| `usher.image.repository`      | Usher image                  | `circus-usher`        |
| `usher.service.port`          | Usher service port           | `7392`                |

### Example Custom Values

```yaml
# custom-values.yaml
ringmaster:
  image:
    repository: my-registry/circus-ringmaster
    tag: v1.0.0
  env:
    chimpImage: my-registry/circus-chimp:v1.0.0
    reconcileInterval: "60000"

usher:
  image:
    repository: my-registry/circus-usher
    tag: v1.0.0
  service:
    type: LoadBalancer

minio:
  auth:
    rootUser: admin
    rootPassword: strongpassword
```

## Accessing Services

### Usher API

Port-forward to access the Usher API locally:

```bash
kubectl port-forward svc/circus-usher 3000:3000
```

Then access at: http://localhost:3000

### MinIO Console

Port-forward to access the MinIO console:

```bash
kubectl port-forward svc/circus-minio 9001:9001
```

Then access at: http://localhost:9001

Login with the credentials set in `minio.auth.rootUser` and `minio.auth.rootPassword`.

## Upgrading

```bash
helm upgrade circus ./charts/circus -f custom-values.yaml
```

## Uninstalling

```bash
helm uninstall circus
```

This will remove all Kubernetes resources associated with the chart.

## Troubleshooting

### Check pod status

```bash
kubectl get pods -l app.kubernetes.io/instance=circus
```

### View logs

```bash
# Ringmaster logs
kubectl logs -l app.kubernetes.io/component=ringmaster

# Usher logs
kubectl logs -l app.kubernetes.io/component=usher

# NATS logs
kubectl logs -l app.kubernetes.io/component=nats

# Redis logs
kubectl logs -l app.kubernetes.io/component=redis

# MinIO logs
kubectl logs -l app.kubernetes.io/component=minio
```

### Verify secret

```bash
kubectl get secret anthropic-api-key -o yaml
```

## Development

To test the chart locally without installing:

```bash
# Lint the chart
helm lint ./charts/circus

# Render templates
helm template circus ./charts/circus --set secrets.anthropicApiKey.value="test-key"

# Dry run
helm install circus ./charts/circus --dry-run --debug
```

## Architecture

The Circus platform follows this event-driven architecture:

1. **External Event** (Slack message, GitHub comment, etc.)
2. **Usher** receives webhook, correlates to session, publishes to NATS
3. **NATS JetStream** durably buffers messages
4. **Ringmaster** detects messages, ensures Chimp pod is running
5. **Chimp** pod processes messages using AI Agent SDK
6. **Responses** published back to NATS and forwarded to external systems
7. **Idle Chimps** automatically shut down after 30 minutes to save resources

### Key Features

- **Event-Driven**: Sub-second response times with NATS-based messaging
- **Auto-Scaling**: Chimps spin up on-demand and shut down when idle
- **Session Continuity**: Automatic correlation ensures conversations route to the same Chimp
- **High Availability**: Ringmaster supports horizontal scaling with 3+ replicas

For detailed architecture documentation, see [ARCHITECTURE.md](../../ARCHITECTURE.md).
