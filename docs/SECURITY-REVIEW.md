# Security Review — Phase 12

`docs/SECURITY-MODEL.md` is the contract written before Phase 1; this is
the Phase 12 hardening pass against it — what got checked, what was found,
and what changed as a result. Findings only; the contract itself is
unchanged (still fully honored, now with two more of its own promises
actually built).

## Closed gaps against `docs/SECURITY-MODEL.md`'s own stated contract

1. **Rate limiting.** The contract has said since Phase 1: "Rate limiting
   (OTP requests, login attempts... payment-webhook replay, support-ticket
   spam) is implemented via Redis counters in the relevant module's service
   layer as each module lands." No phase actually built this — `redis` was
   used only for session-lookup caching. `src/server/rate-limit.ts`
   (Redis `INCR`+`EXPIRE`) plus `src/proxy.ts` (Next.js 16's renamed
   `middleware.ts`, Node.js runtime by default in this version) now gate
   `/api/auth/otp/request`, `POST /api/support/tickets`, and
   `/api/payments/webhook/*` by IP, on top of the per-mobile OTP cooldown
   that already existed. Verified live against the deployed container:
   flooding one endpoint from one IP returns `429` after the configured
   limit (20/5min for OTP requests, in this test), and the corresponding
   Redis key carries a `TTL` matching the window.
2. **Audit log access.** The contract lists "audit log access" as an
   MFA-gated privileged action — but nothing had ever *read* `AuditEvent`
   back before this phase. `modules/audit/audit.service.ts` +
   `/admin/audit` (Phase 11 built the model's read path already for
   refunds' sake; this generalizes it) close that gap.

## OWASP Top 10 pass

- **A01 Broken Access Control** — every `route.ts` under `src/app/api`
  was checked for an auth call (`requireSession`/`requireRole`/
  `requireAdminMfa`) or an explicit reason it's public. 16 routes have no
  auth check; all 16 are deliberately public (health/ready probes, the
  OTP request/verify endpoints themselves, `/api/consent/current`, and the
  `/api/public/*` discovery catalogue) — no gap found.
- **A02 Cryptographic Failures** — session tokens are SHA-256-hashed
  server-side (raw token never stored), OTP codes are HMAC-SHA256'd with a
  server-only pepper, Razorpay webhook/checkout signatures are verified
  with `timingSafeEqual`. TLS terminates at Nginx once a real domain +
  certificate exist (`infra/nginx/abies.conf`'s comment covers exactly how)
  — no certificate exists in this session to terminate HTTPS with, so this
  remains the one open item, blocked on infrastructure this session
  doesn't have, not on missing code.
- **A03 Injection** — Prisma (parameterized) everywhere; the only raw SQL
  in the codebase is `/api/ready`'s hardcoded `SELECT 1`, no interpolation.
- **A04 Insecure Design** — each phase's own `docs/SECURITY-MODEL.md`-
  driven design (RBAC, ownership scoping, consent, audit) reviewed as
  already in place; nothing new found this pass beyond the two gaps above.
- **A05 Security Misconfiguration** — added `Content-Security-Policy` and
  `Strict-Transport-Security` to the four headers (`X-Content-Type-Options`,
  `X-Frame-Options`, `Referrer-Policy`, `Permissions-Policy`) already set
  in `next.config.mjs` since Phase 0. CSP uses the "without nonces" recipe
  (not nonce-based) deliberately — nonces require forcing every page to
  render dynamically, which would regress this app's genuinely-static
  pages (`/login`, `/support`, `/terms`, `/privacy`, `/partners`); verified
  live that it doesn't silently break the app's own client-side JS or the
  one external script this app loads (`checkout.razorpay.com`) by watching
  the browser console for CSP violations through a full login + doctor-
  discovery + checkout-script-load walkthrough against the built container
  — none fired. `errorResponse()` (`src/lib/errors.ts`) already never
  leaks stack traces/DB error text to the client, confirmed unchanged.
- **A06 Vulnerable and Outdated Components** — `npm audit` reports 4 high
  findings, all inside the `prisma` CLI **devDependency**'s own transitive
  tree (`@prisma/config` → `deepmerge-ts`; `prisma` → `mysql2`), not in any
  runtime dependency. `mysql2` is unreachable in this codebase regardless
  (Postgres-only, via `@prisma/adapter-pg`) and the CLI runs only at
  build/migrate time against trusted input, never in a request path. The
  suggested fix (`npm audit fix --force`) downgrades `prisma` to `6.19.3`,
  a breaking change to the Prisma 7 config API (`prisma.config.ts`) every
  migration across all 12 phases depends on — reviewed and accepted as a
  low-real-risk finding rather than risking that regression this late.
  `@prisma/client`/`@prisma/adapter-pg` (the actual runtime dependencies)
  have zero findings.
- **A07 Identification and Authentication Failures** — OTP cooldown/
  expiry/max-attempts, session sliding expiry + revocation, and admin MFA
  (with the dev-bypass hard-disabled in a locked-down deployment) all
  reviewed unchanged from `docs/SECURITY-MODEL.md`'s existing contract.
- **A08 Software and Data Integrity Failures** — Razorpay webhook payloads
  are signature-verified before any state change; `docker-compose.prod.yml`
  now runs `prisma migrate deploy` (never `db push`) automatically via a
  one-shot `migrate` service gating `app`'s startup, closing the gap where
  a real deploy had no automated migration step at all (previously: none
  — migrations only ever ran by hand, against the dev-exposed Postgres
  port, which the production overlay doesn't even publish).
- **A09 Logging and Monitoring Failures** — every `console.error`/`.log`/
  `.warn` call site in `src/` (10 of them, spanning the four payment-taking
  modules' checkout-failure paths, the Razorpay webhook, Redis connection
  errors, the notification mock adapter, and the generic unhandled-error
  fallback) now goes through `src/lib/logger.ts` — structured JSON
  (timestamp/level/scope/message/context) instead of an unstructured
  string, so a real log aggregator can parse it. `/api/ready` now also
  checks object storage connectivity (previously database + Redis only),
  and `src/proxy.ts` stamps every request with an `x-request-id` header
  for correlating a report back to server-side logs.
- **A10 Server-Side Request Forgery** — no server-side code fetches a URL
  built from user input anywhere in `src/lib` or `src/modules` (checked by
  search — the only server-side external calls are the fixed, hardcoded
  Razorpay/notification-provider API base URLs, never a caller-supplied
  address).

## Other hardening in this pass

- **CI**: `.github/workflows/ci.yml` had no MinIO service, so any
  integration test that exercises file upload (doctor documents, reports,
  ...) would fail against a real GitHub Actions run — added a MinIO
  service (bitnami's image, since Actions services can't override `CMD`
  to pass `server /data`, which the official `minio/minio` image needs)
  with automatic bucket creation via `MINIO_DEFAULT_BUCKETS`. Not run
  against a real GitHub Actions runner in this session (none available
  here) — reasoned through and internally consistent with the local
  Docker equivalent below, but flagged as the one CI change not
  live-verified.
- **MinIO bucket creation**: nothing in this codebase had ever automated
  creating `STORAGE_BUCKET` — it only existed locally because someone (a
  much earlier point in this session) created it by hand. A fresh
  environment (a real deploy, that GitHub Actions run) would have had
  every upload fail with "no such bucket" until someone noticed and fixed
  it manually. `docker-compose.yml`'s new one-shot `storage-init` service
  (`mc mb --ignore-existing`) fixes this for local/prod; verified live —
  torn down and rebuilt the full stack, `storage-init` created the bucket
  automatically, `/api/ready`'s new storage check reported `ok`.
- **Pagination ceilings**: `modules/support/tickets.service.ts`'s
  `listQueue` and `modules/partners/leads.service.ts`'s `listLeads` had no
  `take` limit — an unfiltered department/pipeline view could eventually
  load an unbounded number of rows. Added a `take: 200` ceiling to both
  (not full pagination — a status/stage filter already keeps normal usage
  well under that; this is the backstop for the unfiltered view).

## Verification

`tsc --noEmit`, `eslint .`, `vitest run` (103/103, stable across 3
consecutive runs — was 100/100 before this phase, +3 new
`rate-limit.test.ts` tests) all clean; `next build` locally (confirms
`src/proxy.ts` compiles as `ƒ Proxy (Middleware)`); full Docker rebuild;
brought up the **complete** production topology for the first time this
session — `docker compose -f docker-compose.yml -f docker-compose.prod.yml
up -d`, not just the dev overlay used for every prior phase's review
deployment — which caught and fixed two real bugs in the process:
`docker-compose.prod.yml`'s `ports: !reset [...]` on `app` silently
produced *no* port binding at all rather than the intended
`127.0.0.1:3000:3000` (Compose Specification's `!reset` clears to empty;
`!override` is the tag for replacing with new content — verified via
`docker compose config` before and after the fix), and the `storage-init`
service's `minio/mc` image name doesn't exist (needed
`quay.io/minio/mc`, matching the registry the `minio` server image itself
already uses). With both fixed: the one-shot `migrate` service ran
`prisma migrate deploy` cleanly (found all 10 existing migrations already
applied, applied none, exited 0) and `storage-init` created the bucket,
both gating `app`'s startup as designed; installed Nginx on this host to
serve `infra/nginx/abies.conf` for real (not just eyeballed) and confirmed
the full header set (including the new CSP/HSTS) and `x-request-id` pass
through the proxy correctly, and that IP-based rate limiting returns `429`
through it. `scripts/backup.sh` and `scripts/restore.sh`
(`docs/BACKUP-RESTORE.md`) were both run for real against the live dev
stack — backed up Postgres (1.7MB) + MinIO (15MB across the accumulated
doctor-document fixtures from every earlier phase's testing), then
restored from that exact backup (drop/recreate database, replace bucket
contents), and confirmed the demo patient/admin and all 12 doctor
documents came back correctly afterward.

## What this phase did not do, and why

- **No real TLS certificate** — no domain name exists to issue one for in
  this session; `infra/nginx/abies.conf`'s own comment says exactly what
  to run (`certbot --nginx -d your-domain.example`) once one does, since
  certbot rewrites the config in place rather than needing anything
  hand-authored ahead of time.
- **No real deployment to the Ubuntu ESXi VM** — no SSH access to that
  target exists in this session (outstanding since Phase 0). Everything
  that *can* be verified without it — the exact `docker-compose.yml` +
  `docker-compose.prod.yml` combination that VM would run, end to end —
  was verified locally instead, which is the most complete substitute
  available here.
- **No nonce-based CSP / Subresource Integrity** — both are legitimate
  stricter alternatives Next.js supports, both come with real costs (nonce
  CSP disables static rendering entirely; SRI is experimental and doesn't
  cover this app's one actual external script source, which is loaded
  dynamically at runtime, not via a build-time `<script>` tag SRI could
  hash). The simpler "without nonces" CSP was the better fit for what this
  app actually needs protected against.
- **No continuous/point-in-time database recovery** — `docs/BACKUP-RESTORE.md`
  says this explicitly; nightly `pg_dump` snapshots are what the brief
  asked for ("backup scripts... and a documented restore/rollback
  procedure"), not a WAL-shipping replication setup.
