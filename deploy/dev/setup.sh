#!/usr/bin/env bash

set -euo pipefail

DIRNAME=$(dirname "$0")

cd "$DIRNAME"

helm repo add open-telemetry https://open-telemetry.github.io/opentelemetry-helm-charts
helm repo update

kubectl apply -f k8s
helm upgrade \
  --install \
  otel-collector \
  open-telemetry/opentelemetry-collector \
  -f helm/otel-collector-values.yaml

echo "waiting to create test bucket..."
kubectl wait --for=condition=available deploy/minio --timeout=5m
kubectl exec -it deploy/minio -- sh <<EOF
mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb --ignore-existing local/claude-sessions
EOF
