#!/usr/bin/env bash

set -euo pipefail

DIRNAME=$(dirname "$0")

cd "$DIRNAME"

minikube status || {
  echo "minikube not ready"
  exit 1
}
kubectl get secret anthropic-api-key || {
  echo "secret doesn't exist, creating..."
  kubectl create secret generic anthropic-api-key --from-env-file=.env
}
eval "$(minikube -p minikube docker-env)"
docker buildx bake
deploy/dev/setup.sh
helm upgrade \
  --install \
  circus \
  charts/circus \
  -f charts/circus/values-dev.yaml
