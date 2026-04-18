# Development Deployment

This overlay deploys all infrastructure components for local development.

## Deploy Everything

```bash
# From repo root
./setup_dev.sh
```

Or manually:

```bash
# Infrastructure (Redis, NATS, MinIO, LGTM stack)
kubectl apply -k deploy/overlays/dev

# OTel Collector (Helm)
helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts
helm upgrade --install otel-collector open-telemetry/opentelemetry-collector \
  -f deploy/overlays/dev/helm/otel-collector-values.yaml

# Circus services (Helm)
helm upgrade --install circus charts/circus -f charts/circus/values-dev.yaml
```

## OpenTelemetry Collector

Runs as a DaemonSet on each node:
- **Collects logs** from all pods automatically (via `logsCollection` preset)
- **Receives telemetry** via OTLP (gRPC on 4317, HTTP on 4318)
- **Scrapes Prometheus metrics** from Circus services:
  - Bullhorn (`:9090/metrics`)
  - Usher (`:9091/metrics`)
  - Ringmaster (`:9093/metrics`)
  - Chimp pods (`:9092/metrics`) - auto-discovered via Kubernetes labels
- **Exports to**: Logs → Loki, Traces → Tempo, Metrics → Mimir

## Accessing Grafana

```bash
kubectl port-forward svc/grafana 3000:3000
```

Then open http://localhost:3000 (no login required in dev mode)
