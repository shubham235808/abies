#!/usr/bin/env bash
set -euo pipefail
abies_root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)
export KUBECONFIG="${KUBECONFIG:-$abies_root/.runtime/kubeconfig}"
export PATH="$abies_root/.runtime/bin:$PATH"
kubectl get nodes
helm list -A
kubectl -n argocd get applications
kubectl -n abies get deployment,pods,svc,pvc,ingress
