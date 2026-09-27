#!/usr/bin/env bash
# Restores a backup created by scripts/backup.sh — DESTRUCTIVE: drops and
# recreates the Postgres database, and replaces the MinIO bucket contents,
# so this refuses to run without an explicit --force or interactive
# confirmation. See docs/BACKUP-RESTORE.md for the full procedure.
#
# Usage: ./scripts/restore.sh <backup-dir> [--force]
#   <backup-dir> is one timestamped directory produced by backup.sh
#   (contains postgres.sql.gz and minio/).
set -euo pipefail

cd "$(dirname "$0")/.."
if [ -f .env ]; then set -a; source .env; set +a; fi

SNAPSHOT_DIR="${1:?Usage: restore.sh <backup-dir> [--force]}"
FORCE="${2:-}"

POSTGRES_USER="${POSTGRES_USER:-abies}"
POSTGRES_DB="${POSTGRES_DB:-abies_ayurveda}"
STORAGE_BUCKET="${STORAGE_BUCKET:-abies-private}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-abies-postgres}"
MINIO_CONTAINER="${MINIO_CONTAINER:-abies-minio}"
APP_CONTAINER="${APP_CONTAINER:-abies-app}"

if [ ! -f "$SNAPSHOT_DIR/postgres.sql.gz" ]; then
  echo "No postgres.sql.gz found in $SNAPSHOT_DIR — is this a backup.sh output directory?" >&2
  exit 1
fi

if [ "$FORCE" != "--force" ]; then
  echo "This will DROP and recreate database '$POSTGRES_DB' and replace all objects in MinIO bucket '$STORAGE_BUCKET'."
  read -r -p "Type 'yes' to continue: " confirm
  if [ "$confirm" != "yes" ]; then
    echo "Aborted."
    exit 1
  fi
fi

echo "==> Stopping app container so it can't hold connections open"
docker stop "$APP_CONTAINER" >/dev/null 2>&1 || true

echo "==> Dropping and recreating $POSTGRES_DB"
docker exec "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d postgres -v ON_ERROR_STOP=1 \
  -c "SELECT pg_terminate_backend(pid) FROM pg_stat_activity WHERE datname = '$POSTGRES_DB' AND pid <> pg_backend_pid();" \
  -c "DROP DATABASE IF EXISTS \"$POSTGRES_DB\";" \
  -c "CREATE DATABASE \"$POSTGRES_DB\";"

echo "==> Restoring Postgres from $SNAPSHOT_DIR/postgres.sql.gz"
gunzip -c "$SNAPSHOT_DIR/postgres.sql.gz" | docker exec -i "$POSTGRES_CONTAINER" psql -U "$POSTGRES_USER" -d "$POSTGRES_DB" -v ON_ERROR_STOP=1

if [ -d "$SNAPSHOT_DIR/minio" ]; then
  echo "==> Restoring MinIO bucket $STORAGE_BUCKET from $SNAPSHOT_DIR/minio/"
  STORAGE_ACCESS_KEY_ID="${STORAGE_ACCESS_KEY_ID:?set STORAGE_ACCESS_KEY_ID in .env}"
  STORAGE_SECRET_ACCESS_KEY="${STORAGE_SECRET_ACCESS_KEY:?set STORAGE_SECRET_ACCESS_KEY in .env}"
  docker exec "$MINIO_CONTAINER" mc alias set backup http://localhost:9000 "$STORAGE_ACCESS_KEY_ID" "$STORAGE_SECRET_ACCESS_KEY" >/dev/null
  REMOTE_DIR="/tmp/abies-restore-$(date +%s)"
  docker exec "$MINIO_CONTAINER" mkdir -p "$REMOTE_DIR"
  docker cp "$SNAPSHOT_DIR/minio/." "$MINIO_CONTAINER:$REMOTE_DIR/"
  docker exec "$MINIO_CONTAINER" mc rm --quiet --recursive --force "backup/$STORAGE_BUCKET" >/dev/null 2>&1 || true
  docker exec "$MINIO_CONTAINER" mc mirror --quiet "$REMOTE_DIR" "backup/$STORAGE_BUCKET" >/dev/null
  docker exec "$MINIO_CONTAINER" rm -rf "$REMOTE_DIR"
fi

echo "==> Restarting app container"
docker start "$APP_CONTAINER" >/dev/null 2>&1 || echo "    (app container not found — start it manually, e.g. docker compose up -d app)"

echo "==> Restore complete."
