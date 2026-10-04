# Platform Assessment — Current State

Snapshot as of 2026-10-04, written against `docs/platform/CONTRACT.md`'s
request (the platform team's environment/deployment contract pasted into
this session). Verified by reading the actual code, not by recalling
earlier docs — where this disagrees with `docs/CURRENT-STATE.md` or
`docs/IMPLEMENTATION-STATUS.md` (both older), this file is the more
current source.

## 1. Repository & architecture

pnpm workspace + Turborepo monorepo, branch `expansion-5-four-app-migration`
(not yet merged to `main`):

- `apps/client-web` — public site + patient portal + auth. Unprefixed
  (catch-all `/`).
- `apps/partner-web` — doctor/lab/pharmacy/panchakarma-centre portals.
  Physically nested at `/partner/*`.
- `apps/management-web` — admin/support/sales/care-coordination portals.
  Physically nested at `/ops/*`.
- `apps/platform-api` — every `/api/*` route handler. No UI.
- `packages/domain` — all business logic, Prisma schema/client, server
  auth/session/RBAC, zod env schema. Shared by all four apps and by
  `packages/design-system`.
- `packages/design-system` — shared UI components (buttons, cards, the
  portal shell/nav, support widgets). Used by the three frontend apps,
  not `platform-api`.

Each app builds to Next.js `output: 'standalone'`; one parameterized
`Dockerfile` (`ARG APP_NAME`) builds any of the four, plus a `migrator`
target (same image family, different `CMD`, runs `prisma migrate deploy`).
Already runs as non-root (`USER nextjs`, uid 1001) — no Docker socket, no
DinD, consistent with the kaniko-based build this contract requires.

## 2. Frontend / backend split

All four apps are Next.js 16 (App Router). `platform-api` is the only one
with API routes — the other three call it through relative `/api/*`
fetches from the browser, which only resolve correctly when something
(Gateway API path routing, in the target state) makes `/api/*` same-origin
regardless of which app rendered the page.

## 3. API surface

**Not versioned** — routes are `/api/auth/...`, `/api/admin/...`, etc.,
not `/api/v1/...`. ~29 route groups under `apps/platform-api/src/app/api/`
(auth, admin, appointments, consultations, diagnostics, medicines,
panchakarma, payments, support, hospital-admissions, and more).

## 4. Database

PostgreSQL via Prisma. **83 models**, **27 tracked migrations**
(`packages/domain/prisma/migrations/`). `package.json` scripts:
`prisma:generate`, `prisma:migrate` (`prisma migrate dev`, local-only),
`prisma:deploy` (`prisma migrate deploy` — what the Dockerfile's
`migrator` target and the existing `docker-compose.prod.yml` both run),
`db:reset`. **No use of `prisma db push` anywhere** — migrations are
already the only schema-change mechanism, matching this contract's
requirement directly.

## 5. Authentication & sessions

- **Login**: mobile OTP (`+91`-normalized), HMAC-peppered hash
  (`OTP_PEPPER`), per-mobile cooldown, max-attempt lockout, all DB-backed
  (`OtpChallenge`).
- **Admin**: a second MFA step (`ADMIN_MFA_REQUIRED`) gating session
  `mfaVerified`.
- **Session**: HTTP-only cookie carrying an opaque random token
  (`abies_session`) — server looks up a `Session` row by its SHA-256 hash
  on every request, Redis-cached 60s, sliding expiry (reissues past the
  halfway point of `SESSION_TTL_DAYS`), explicit revocation
  (`revokeSession`/`revokeAllSessionsForUser`). Cookie `Secure` flag is
  derived from `APP_BASE_URL`'s scheme, not `NODE_ENV`. **Not JWT** —
  an earlier doc (`docs/CURRENT-STATE.md`, 2026-09-23) describes a bearer
  JWT model; that's stale, the implementation changed since.
- **RBAC**: every authenticated route handler calls `requireSession()`
  first (never trusts request-body identity), then one of
  `requireRole()` / `requirePermission()` / `requireAdminMfa()`.
  Server-side only — confirmed no reliance on hiding frontend UI as an
  authorization boundary.
- **Consent**: `ConsentArtifact`/`ConsentRecord` models exist, consent
  auto-recorded on OTP verification.
- **Audit**: `recordAuditEvent()` called from 36 files across the module
  layer — broad, not token coverage of every mutation.

## 6. Rate limiting

`src/proxy.ts` (Next.js middleware, identical copy in all four apps) adds
an IP-scoped Redis rate limit on top of the DB-level OTP cooldown, for
`/api/auth/otp/request`, `/api/support/tickets` (POST), and
`/api/payments/webhook`. **Only meaningful in `platform-api`** — the other
three apps never actually receive `/api/*` requests once Gateway API
routing is in front (that traffic goes straight to `platform-api`), so
their copies of this file are inert, not buggy.

## 7. Health endpoints

`platform-api` already has:
- `GET /api/health` — liveness, no dependency checks.
- `GET /api/ready` — readiness, checks Postgres (`SELECT 1`), Redis
  (`PING`), and object storage, returns `503` if any fail.

This is **already the right semantic split** this contract asks for
(live vs. ready) — just not at the `/api/v1/health`, `/api/v1/health/ready`,
`/api/v1/health/live` paths it specifies, and not nested the same way.
**`client-web`, `partner-web`, `management-web` have no health endpoint of
their own at all.**

## 8. Logging

`packages/domain/src/lib/logger.ts` — structured JSON, one line per event
(`timestamp`, `level`, `scope`, `message`, optional `context`), errors
serialized explicitly (message/stack extracted, since `Error` doesn't
`JSON.stringify` usefully). **Fully adopted** — zero raw `console.log`/
`console.error`/`console.warn` calls remain outside this module (verified
by grep across `packages/domain/src` and every app's `src/`). Doesn't yet
include `service`/`environment`/correlation-id fields in the base log
shape (this contract's §16 wants those).

Request correlation exists separately: `proxy.ts` stamps `x-request-id` on
every response; `packages/design-system/src/error-correlation.ts` captures
it client-side (sessionStorage, 30-minute TTL) so a support ticket filed
after a failed request can attach it automatically. Not yet threaded
through to the structured server logs themselves (i.e. a given request's
log lines don't currently carry its own `x-request-id`).

## 9. Configuration & secrets

Single source of truth: `packages/domain/src/lib/env.ts`, a zod schema
(`getEnv()`), fails fast at startup on anything missing/invalid. Real
secret **names** in use (values never read or printed by this
assessment):

`DATABASE_URL`, `REDIS_URL`, `STORAGE_ENDPOINT`, `STORAGE_ACCESS_KEY_ID`,
`STORAGE_SECRET_ACCESS_KEY`, `SESSION_SECRET`, `OTP_PEPPER`,
`RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, `RAZORPAY_WEBHOOK_SECRET`,
`SMS_API_KEY`, `EMAIL_API_KEY`, `WHATSAPP_API_KEY`.

Non-secret config (already separable, already env-var-driven, no
hard-coded per-environment URLs found in application code):
`NODE_ENV`, `STORAGE_REGION`/`STORAGE_BUCKET`/`STORAGE_FORCE_PATH_STYLE`,
OTP/rate-limit tuning vars, `SESSION_TTL_DAYS`, `ADMIN_MFA_REQUIRED`,
self-onboarding flags, `APP_BASE_URL`, `UPLOAD_MAX_BYTES`,
`SMS_PROVIDER`/`EMAIL_PROVIDER`/`WHATSAPP_PROVIDER`.

## 10. File storage & uploads

S3-compatible object storage (MinIO in the current dev/VM deployment) via
`STORAGE_*` vars. `assertUploadAllowed()` (`packages/domain/src/lib/storage.ts`)
checks declared MIME type against an allow-list and size against
`UPLOAD_MAX_BYTES`, called consistently from every upload path (doctor
credential docs, diagnostic reports, support ticket attachments,
promotion images, partner-lead attachments). **Validates the
client-declared MIME type, not file content/magic bytes** — see
`SECURITY-GAP-ANALYSIS.md`.

## 11. Background jobs, scheduled jobs, WebSockets

- **`bullmq`** is a declared dependency in `packages/domain/package.json`
  but **is not imported or used anywhere in the codebase** — no `Queue`,
  no `Worker`. The `workers/` directory in `pnpm-workspace.yaml`'s
  packages glob has never been populated. There is currently no
  background-job processing of any kind, and so no case for a dedicated
  worker Deployment in Kubernetes today.
- **No scheduled/cron jobs** anywhere in the codebase.
- **No WebSockets** — live video consultation was explicitly scoped out
  (no real provider), confirmed still absent from the code.

## 12. Payment integration

Razorpay. `packages/domain/src/lib/payments/razorpay.ts`: order-id/
payment-id/signature verification (`verifySignature`) and a separate
webhook signature check, **both HMAC-SHA256 with `timingSafeEqual`**
(constant-time comparison, not `===`) — correct practice already in
place. Checkout.js loaded on demand client-side, not bundled.

## 13. SMS / Email / WhatsApp — the one real production blocker

`packages/domain/src/lib/notifications/`: an adapter interface with
exactly one implementation, `mock-adapter.ts`. `getAdapter()` returns
`null` for every channel whenever `isLockedDownDeployment(env)` is true
(`NODE_ENV=production` and `ALLOW_DEV_AUTH_BYPASS_IN_PROD` not explicitly
set) — by design, so a placeholder never silently claims delivery.

**More importantly**: `requestOtp()` (`packages/domain/src/modules/auth/auth.service.ts`)
**never calls `notify()`/`getAdapter()`/any delivery mechanism at all.**
It generates the OTP, stores its hash, and returns it to the caller only
when `!lockedDown && EXPOSE_DEV_OTP` is true. In a genuinely locked-down
deployment there is currently **no code path that delivers the OTP to the
user by any channel** — not "the SMS provider isn't configured," but that
nothing in the login flow has ever attempted dispatch. See
`SECURITY-GAP-ANALYSIS.md` §1 — this is a known, previously-documented,
deliberate deferral (`docs/IMPLEMENTATION-STATUS.md`: "no real SMS/email/
WhatsApp provider is wired up yet... a decision for whoever owns the admin
operations budget"), not an oversight, but it is an absolute blocker for
real users in a production environment regardless of how well-understood
it already is.

## 14. Existing containerization

Root `Dockerfile`: multi-stage, `deps` → `builder` (full workspace,
`ARG APP_NAME`) → `migrator` (same builder, `CMD` runs `prisma migrate
deploy`) → `runner` (only the traced `.next/standalone` output, non-root
`nextjs` user). Built via `docker build --build-arg APP_NAME=<app>`.
`.dockerignore` excludes `.env`, `node_modules`, `.git`. No privileged
flags, no Docker socket dependency — kaniko-compatible as-is (already
confirmed working via kaniko in this session's own Tekton Task).

## 15. Current production deployment — must remain untouched

A single-container variant of this same application runs on an Ubuntu VM
via Docker Compose + Nginx + Let's Encrypt TLS, serving `abies.in` today.
Per this contract's §22, this is explicitly out of scope for any change
until the Kubernetes implementation is built, validated, and approved for
cutover — this assessment does not propose touching it, and nothing in
this session's prior work (EXPANSION-5 four-app split, verified on
isolated ports) touched it either.

## 16. Kubernetes/GitOps scaffolding already drafted this session

Before this contract was shared, this session built a first-pass
Tekton+ArgoCD scaffold assuming a generic setup: GitHub (not Gitea),
tag-based image references (not Harbor digest pinning), a single `abies`
namespace (not `abies-dev`/`abies-uat`/`abies-prod`/`abies-ci`), plain
`kubectl`-applied Kubernetes `Secret`s (not Vault/External Secrets), a
per-app-overlay Kustomize layout (not this contract's `applications/<app>/
base` + top-level `environments/<env>` layout), and assumed a Gateway
resource exists without confirming its actual name
(`abies-internal-gateway`) or namespace (`abies-gateway`). None of it has
been applied to any cluster — see `docs/platform/IMPLEMENTATION-PLAN.md`
for what's reusable versus what needs rebuilding to match this contract.
