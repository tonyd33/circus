# Development Deployment

This directory contains manifests and configurations for local development.

## LGTM Stack (Loki, Grafana, Tempo, Mimir)

Deploy the observability stack:

```bash
kubectl apply -f loki.yml
kubectl apply -f grafana.yml
kubectl apply -f tempo.yml
kubectl apply -f mimir.yml
```

## Infrastructure Services

```bash
kubectl apply -f redis.yml
kubectl apply -f nats.yml
kubectl apply -f minio.yml
```

## OpenTelemetry Collector

The OpenTelemetry Collector is deployed using the official Helm chart.

### Install

```bash
# Add the Helm repository
helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts
helm repo update

# Install the collector
helm install otel-collector open-telemetry/opentelemetry-collector \
  -n default \
  --values otel-collector-values.yaml
```

### Upgrade

```bash
helm upgrade otel-collector open-telemetry/opentelemetry-collector \
  -n default \
  --values otel-collector-values.yaml
```

### Uninstall

```bash
helm uninstall otel-collector -n default
```

### What it does

The collector runs as a DaemonSet on each node and:
- **Collects logs** from all pods automatically (via `logsCollection` preset)
- **Receives telemetry** via OTLP (gRPC on 4317, HTTP on 4318)
- **Scrapes Prometheus metrics** from Circus services:
  - Bullhorn (`:9090/metrics`)
  - Usher (`:9091/metrics`)
  - Ringmaster (`:9093/metrics`)
  - Chimp pods (`:9092/metrics`) - auto-discovered via Kubernetes labels
- **Enriches data** with Kubernetes metadata
- **Exports to**:
  - Logs → Loki
  - Traces → Tempo
  - Metrics → Mimir

## Accessing Grafana

```bash
kubectl port-forward svc/grafana 3000:3000
```

Then open http://localhost:3000 (no login required in dev mode)
