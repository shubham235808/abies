# Backup & Restore

Written in Phase 12 per `docs/IMPLEMENTATION-PLAN.md` and
`docs/TARGET-ARCHITECTURE.md`'s deployment topology section, which named
this file and these scripts as a Phase 12 deliverable from the start.

## What's backed up

| Data | Where it lives | Backup method |
|---|---|---|
| Everything in `prisma/schema.prisma` (users, appointments, orders, tickets, audit log, ...) | Postgres | `pg_dump` (gzipped plain SQL) |
| Doctor documents, diagnostic reports, prescriptions, support attachments, partner lead documents | MinIO (`STORAGE_BUCKET`) | `mc mirror` (MinIO's own bundled client, run inside the `minio` container) |

Redis is **not** backed up — it holds only session-lookup cache (rebuilt from
Postgres `Session` rows on first miss) and rate-limit counters
(`src/server/rate-limit.ts`), both fine to lose. No application data lives
only in Redis.

## Scripts

- `scripts/backup.sh [backup-dir]` — dumps Postgres and mirrors the MinIO
  bucket into `<backup-dir>/<timestamp>/` (`./backups/` by default, gitignored).
  Safe to run against a live system — `pg_dump` and `mc mirror` are both
  read-only against the source.
- `scripts/restore.sh <backup-dir>/<timestamp> [--force]` — **destructive**:
  stops the app, drops and recreates the Postgres database, replaces every
  object in the MinIO bucket, restores from the given snapshot, restarts the
  app. Refuses to run without typing `yes` (or passing `--force` for
  scripted/tested use).

Both scripts read `POSTGRES_USER`, `POSTGRES_DB`, and `STORAGE_BUCKET` from
`.env` if present (same defaults `docker-compose.yml` uses otherwise), and
assume the standard container names (`abies-postgres`, `abies-minio`,
`abies-app`) — override via `POSTGRES_CONTAINER`/`MINIO_CONTAINER`/
`APP_CONTAINER` env vars if a deployment renames them.

## Recommended schedule

A nightly cron entry on the host:

```
0 2 * * * /path/to/abies/scripts/backup.sh /var/backups/abies >> /var/log/abies-backup.log 2>&1
```

Retention isn't automated here — prune `/var/backups/abies/*` on whatever
cycle matches the real deployment's storage budget (e.g. keep 7 daily + 4
weekly). This is a one-line addition to the cron job once a retention policy
is chosen; not fabricated here since no policy has actually been decided.

## Restore procedure

1. Identify the snapshot: `ls /var/backups/abies` (each is one
   `backup.sh` run, named by timestamp).
2. `./scripts/restore.sh /var/backups/abies/<timestamp>`
3. Confirm with `yes` when prompted (or pass `--force` if this is a
   scripted DR drill, not a real incident).
4. Verify: `curl http://localhost:3000/api/ready` should report
   `{"ready":true,...}`; spot-check a known record (e.g. the demo patient
   or admin from `prisma/seed.ts`) actually came back.

Recovery is **whole-database**, not point-in-time or per-table — this
project doesn't run continuous WAL archiving, so RPO is "since the last
`backup.sh` run" (nightly, per the cron entry above) and RTO is however
long `pg_dump`'s reverse (`psql` replay) takes for the current data volume,
plus the MinIO mirror. Both were fine at this project's dev-scale data
volume when last verified (see `docs/IMPLEMENTATION-STATUS.md`'s Phase 12
entry for the actual timing observed).

## What this deliberately does not cover

- **Continuous/point-in-time recovery** (WAL-E, pgBackRest, etc.) — out of
  scope for this MVP; the brief's own ask was "backup scripts... and a
  documented restore/rollback procedure," not a zero-RPO replication setup.
- **Automated off-host/off-site copies** — `backup.sh` writes to a local
  directory; shipping that directory somewhere durable (S3, another host,
  etc.) is an infrastructure decision for whoever operates the real
  deployment, not something to fabricate a destination for here.
- **Redis** — see above, nothing there needs restoring.
