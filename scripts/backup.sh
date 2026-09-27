#!/usr/bin/env bash
# Backs up Postgres (pg_dump, gzipped) and the MinIO bucket (mirrored via
# the mc binary already bundled in the minio image — same one the
# docker-compose healthcheck uses) to $BACKUP_DIR. Restore counterpart:
# scripts/restore.sh. See docs/BACKUP-RESTORE.md for the full procedure.
#
# Usage: ./scripts/backup.sh [backup-dir]
#   Reads POSTGRES_USER/POSTGRES_DB/STORAGE_BUCKET from .env if present,
#   falling back to the same defaults docker-compose.yml uses.
set -euo pipefail

cd "$(dirname "$0")/.."
if [ -f .env ]; then set -a; source .env; set +a; fi

POSTGRES_USER="${POSTGRES_USER:-abies}"
POSTGRES_DB="${POSTGRES_DB:-abies_ayurveda}"
STORAGE_BUCKET="${STORAGE_BUCKET:-abies-private}"
POSTGRES_CONTAINER="${POSTGRES_CONTAINER:-abies-postgres}"
MINIO_CONTAINER="${MINIO_CONTAINER:-abies-minio}"

BACKUP_DIR="${1:-./backups}"
TIMESTAMP="$(date +%Y%m%d-%H%M%S)"
DEST="$BACKUP_DIR/$TIMESTAMP"
mkdir -p "$DEST"

echo "==> Backing up Postgres ($POSTGRES_DB) to $DEST/postgres.sql.gz"
docker exec "$POSTGRES_CONTAINER" pg_dump -U "$POSTGRES_USER" "$POSTGRES_DB" | gzip > "$DEST/postgres.sql.gz"

echo "==> Backing up MinIO bucket ($STORAGE_BUCKET) to $DEST/minio/"
STORAGE_ACCESS_KEY_ID="${STORAGE_ACCESS_KEY_ID:?set STORAGE_ACCESS_KEY_ID in .env}"
STORAGE_SECRET_ACCESS_KEY="${STORAGE_SECRET_ACCESS_KEY:?set STORAGE_SECRET_ACCESS_KEY in .env}"
# The container's built-in `local` alias (used by the docker-compose
# healthcheck's `mc ready local`) is anonymous — fine for a health probe,
# not authorized to read bucket contents. `mirror` needs real credentials.
docker exec "$MINIO_CONTAINER" mc alias set backup http://localhost:9000 "$STORAGE_ACCESS_KEY_ID" "$STORAGE_SECRET_ACCESS_KEY" >/dev/null
REMOTE_DIR="/tmp/abies-backup-$TIMESTAMP"
docker exec "$MINIO_CONTAINER" mc mirror --quiet "backup/$STORAGE_BUCKET" "$REMOTE_DIR" >/dev/null
mkdir -p "$DEST/minio"
docker cp "$MINIO_CONTAINER:$REMOTE_DIR/." "$DEST/minio/"
docker exec "$MINIO_CONTAINER" rm -rf "$REMOTE_DIR"

echo "==> Backup complete: $DEST"
du -sh "$DEST"/* 2>/dev/null || true
