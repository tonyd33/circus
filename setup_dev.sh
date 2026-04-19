#!/usr/bin/env bash

set -euo pipefail

DIRNAME=$(dirname "$0")

cd "$DIRNAME"

minikube status || {
  echo "minikube not ready"
  exit 1
}
kubectl get secret circus-secrets || {
  echo "secret doesn't exist, creating..."
  kubectl create secret generic circus-secrets --from-env-file=.env
}
eval "$(minikube -p minikube docker-env)"
docker buildx bake

# Deploy infra + OTel collector via kustomize
kustomize build --enable-helm deploy/k8s/overlays/dev | kubectl apply -f-

# Create MinIO test bucket
echo "waiting to create test bucket..."
kubectl wait --for=condition=available deploy/minio --timeout=5m
kubectl exec -i deploy/minio -- sh <<EOF
mc alias set local http://localhost:9000 minioadmin minioadmin
mc mb --ignore-existing local/circus
EOF

# Deploy circus services via Helm
helm upgrade \
  --install \
  circus \
  charts/circus \
  -f charts/circus/values-dev.yaml
