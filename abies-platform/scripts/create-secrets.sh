#!/usr/bin/env bash
set -euo pipefail
# Random hex is safe in both URL credentials and environment files.
command -v kubectl >/dev/null
command -v openssl >/dev/null
kubectl create namespace abies --dry-run=client -o yaml | kubectl apply -f -
if kubectl -n abies get secret abies-secrets >/dev/null 2>&1; then
  echo 'abies-secrets already exists; leaving database credentials unchanged.'
  exit 0
fi
abies_secret_file=$(mktemp)
trap 'rm -f "$abies_secret_file"' EXIT
chmod 600 "$abies_secret_file"
abies_pg_password=$(openssl rand -hex 32)
abies_redis_password=$(openssl rand -hex 32)
{
  printf 'POSTGRES_PASSWORD=%s\n' "$abies_pg_password"
  printf 'REDIS_PASSWORD=%s\n' "$abies_redis_password"
  printf 'DATABASE_URL=postgresql://abies:%s@postgres:5432/abies\n' "$abies_pg_password"
  printf 'REDIS_URL=redis://:%s@redis:6379/0\n' "$abies_redis_password"
} > "$abies_secret_file"
kubectl -n abies create secret generic abies-secrets --from-env-file="$abies_secret_file"
