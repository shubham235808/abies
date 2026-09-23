# Implementation Status

Updated at the end of each work session. See `docs/IMPLEMENTATION-PLAN.md`
for phase scope and `docs/DECISIONS.md` for why things are shaped this way.

## 2026-09-23 — Session 1

- Read the full `ABIES_Agent_Knowledge_Pack`: Enhanced Blueprint, IT Stack
  deck, Sprint 2 + Sprint 3 NestJS/Prisma source (extracted and reviewed key
  auth/doctors/patients/consents modules, docker-compose, Nginx config,
  migrations), confirmed product/business presentation docs are superseded
  drafts.
- Confirmed with user: prior Express/Helm prototype (git history only) is
  out of scope; knowledge pack is authoritative; engagement proceeds
  phase-by-phase with Workflow-based multi-agent execution.
- Wrote `docs/DECISIONS.md`, `docs/CURRENT-STATE.md`,
  `docs/TARGET-ARCHITECTURE.md`, `docs/DOMAIN-MODEL.md`,
  `docs/IMPLEMENTATION-PLAN.md`, this file.
- **No application code written yet.** Phase 0 (repo scaffold) is next,
  pending user review of the docs above.

## 2026-09-23 — Session 1 (continued): Phase 0 complete

Confirmed with user: docs approved as-is; a real Ubuntu ESXi VM is
available (details pending — see Open Items); some integration sandbox
credentials are available (details pending).

Built and **verified working** (not just written — see Verification below):

- Repo scaffold: Next.js 16 App Router + TypeScript, Tailwind 4, ESLint 9
  flat config, Prettier, Vitest 5 + Testing Library, Playwright.
- `prisma/schema.prisma` — Phase 0 subset (Identity & Access, Patients,
  Doctor/Provider Network) per `docs/DOMAIN-MODEL.md` §1–3, using Prisma 7's
  driver-adapter model (`@prisma/adapter-pg`, `prisma.config.ts`).
- First migration `20260923092611_phase0_identity_patients_doctors` applied
  to a real local Postgres.
- `prisma/seed.ts` — dev accounts (patient/doctor/admin) with real
  city/state/PIN data, correcting D4's placeholder-postcode caveat.
- `src/lib/{db,redis,storage,env}.ts` — Prisma (driver-adapter), Redis
  (lazy-connect, error-handled), S3/MinIO adapter with upload validation,
  fail-fast Zod env validation.
- `src/server/audit.ts` — audit event writer per `docs/SECURITY-MODEL.md`.
- Public homepage (content-only, no fake CTAs — "Coming soon" label on
  sign-in per the brief's No-Fake-Functionality policy) + `/api/health`
  (liveness) + `/api/ready` (real DB+Redis dependency check).
- `docker-compose.yml` (dev, with localhost port bindings for
  Postgres/Redis/MinIO) + `docker-compose.prod.yml` stub (`!reset []` on
  ports) + multi-stage `Dockerfile` (Next standalone output) +
  `infra/nginx/abies.conf`.
- `.github/workflows/ci.yml`, `docs/SECURITY-MODEL.md`, updated `README.md`.

### Verification (all run for real, not assumed)

- Installed Node 22 + Docker on the dev machine (neither was present;
  user authorized `sudo` use).
- `npm install`, `npx prisma generate`, `npx prisma migrate dev`,
  `npx tsx prisma/seed.ts` — all against a real local PostgreSQL container.
- `npm run lint`, `npm run typecheck`, `npm test` (Vitest), `npm run build`
  — all pass clean, zero warnings.
- `npx playwright test` — smoke test passes against a running `next start`.
- Full `docker compose up --build` — all 4 containers (postgres, redis,
  minio, app) reach `healthy`; `/api/health` and `/api/ready` verified via
  curl against the containerized app, confirming real Postgres+Redis
  connectivity across the internal Docker network, not just localhost.
- Found and fixed two real bugs during verification (both documented in
  `docs/DECISIONS.md` D7 and inline code comments): MinIO's Docker Hub image
  now requires auth (switched to `quay.io/minio/minio`), and Next's
  standalone server silently binds to Docker's auto-injected `HOSTNAME`
  (container ID) instead of all interfaces unless overridden.
- `npm audit`: 4 remaining high-severity findings, all transitive
  `mysql2`/`deepmerge-ts` issues inside Prisma's own tooling for a database
  driver (MySQL) this project never uses (schema is `provider = "postgresql"`
  only) — tracked, not blocking, re-check on future `prisma` upgrades.

## Open items (not blocking further phases)

1. VM SSH details (host/user/key) — needed before Phase 12 deployment, not
   before.
2. Which specific integration credentials (Razorpay / SMS / WhatsApp /
   video) are available, and for which environment (sandbox vs. live) —
   needed when the corresponding module (Phase 4+) wires up that adapter,
   not before.

## 2026-09-23 — Session 1 (continued): Phase 1 complete (auth core)

Built and **verified working** end-to-end, both via direct service-layer
integration tests and real HTTP requests against `next dev`:

- `src/server/session.ts` — HTTP-only cookie session: opaque token, hashed
  in the DB, Redis-cached lookups (60s TTL, invalidated on
  rotate/revoke/MFA-verify), sliding-expiry rotation past the halfway point
  of session life. Deviates from Sprint 2/3's JWT+refresh-body pair per
  D3/D6 — session state never leaves the server except as an opaque cookie
  value.
- `src/server/rbac.ts` — `requireSession` (validates + rotates),
  `requireRole`, `requireAdminMfa`, `applyRotatedCookie`. Every
  authenticated route handler goes through this; nothing trusts a
  client-supplied identity.
- `src/modules/auth/auth.service.ts` — `requestOtp`/`verifyOtp`/
  `verifyAdminMfa`/`logout`, porting Sprint 3's exact rules (mobile
  normalization, HMAC OTP hash, cooldown, max attempts, role-gated
  provisioning, dev-bypass hard-disabled in production, admin MFA gate).
  Route handlers: `POST /api/auth/otp/{request,verify}`,
  `POST /api/auth/mfa/verify`, `POST /api/auth/logout`, `GET /api/auth/me`.
- `src/modules/consent/consent.service.ts` — active-artifact listing
  (public), per-user consent history, explicit accept/withdraw for opt-in
  artifacts (required artifacts stay auto-accept-on-login only, per
  `docs/SECURITY-MODEL.md`). Routes under `/api/consent/*`.
- `src/lib/errors.ts` — shared `AppError` hierarchy + Zod-aware
  `errorResponse()` so every route handler maps failures to HTTP the same
  way.
- 9 new integration tests (`tests/integration/{auth,consent}.test.ts`)
  against real Postgres + Redis: registration, terms-required rejection,
  OTP lockout after max attempts, resend cooldown, role-mismatch rejection,
  admin MFA start/wrong-code/correct-code, session revocation on logout,
  consent accept/withdraw. All pass; user/session rows are cleaned up in
  `afterAll`.
- Manually verified the full flow over real HTTP against `next dev`
  (not just the test suite): OTP request → verify → cookie issued →
  authenticated `/api/auth/me` → 401 without the cookie → consent
  listing (public + per-user) → logout → 401 again. Also verified the
  admin path: `mfaRequired: true` on login, `mfaVerified: false` until
  `/api/auth/mfa/verify`, wrong code rejected, correct dev code accepted.
  Also confirmed `next start` (which forces `NODE_ENV=production`)
  correctly suppresses `devOtp` in the response, proving the
  production dev-bypass guard actually engages, not just in theory.
- Dropped `import 'server-only'` from `session.ts`, `rbac.ts`,
  `auth.service.ts`, `consent.service.ts` — that package only resolves to
  its no-op stub under Next's bundler-specific `react-server` condition;
  under plain Vitest/Node it always throws, which would have made direct
  service-layer testing impossible. Traded a compile-time "don't import
  this from a Client Component" guard for testability; the practical risk
  is low since nothing in `src/app/**/page.tsx` or any `'use client'` file
  imports these modules.
- Discovered Next 16 auto-generates `AGENTS.md`/`CLAUDE.md` on `next dev`,
  pointing at `node_modules/next/dist/docs/` — genuinely useful since the
  installed Next/Prisma/Tailwind/ESLint majors are newer than training
  data; consulted it while building the route handlers (confirms the
  `params: Promise<...>` and async `cookies()` patterns already in use).
- **Notable environment finding:** this dev machine's own LAN IP is
  `192.168.1.160` — the exact host pattern the build brief names as the
  target ESXi VM. Worth confirming with the user whether this machine *is*
  the deployment target before Phase 12.

## Open items (not blocking further phases)

1. VM SSH details (host/user/key) — needed before Phase 12 deployment. See
   the `192.168.1.160` note above; may already be answered.
2. Which specific integration credentials (Razorpay / SMS / WhatsApp /
   video) are available, and for which environment (sandbox vs. live) —
   needed when the corresponding module (Phase 4+) wires up that adapter.
3. No production MFA provider is wired up yet (by design — Phase 1 only
   ports the dev-bypass path, hard-disabled outside `NODE_ENV=production`
   exactly like Sprint 3). Picking a real TOTP/SMS provider is a decision
   for whoever owns the admin operations budget, needed before Phase 12's
   security hardening pass, not before.

## 2026-09-23 — Session 1 (continued): Phase 2 complete (patient profile + family)

The Phase 0 schema already had the extended `PatientProfile`/`FamilyMember`
fields from `docs/DOMAIN-MODEL.md` §2, so no migration was needed — Phase 2
was purely the module layer:

- `src/modules/patients/patients.schemas.ts` — Zod validation for profile
  updates and family member CRUD (`FamilyRelation`: PARENT/SPOUSE/CHILD/
  DEPENDENT/OTHER).
- `src/modules/patients/patients.service.ts` — `getMyProfile`,
  `updateMyProfile` (also updates `User.email` when provided, since email
  lives on the account not the profile), family member add/update/remove.
  Ownership is enforced by scoping every family-member lookup through the
  caller's own `PatientProfile` — never by trusting the member id alone.
  Profile updates are audited with the changed field *names* only, never
  values (allergies/medical history are PHI-adjacent).
- Routes: `GET/PATCH /api/patients/me`,
  `GET/POST /api/patients/me/family`,
  `PATCH/DELETE /api/patients/me/family/[id]` — all behind
  `requireRole(ctx, 'PATIENT')`.
- 4 new integration tests: profile starts empty from OTP registration and
  updates correctly, audit log captures field names but never the PHI
  values themselves, family CRUD round-trip, and — the one that mattered
  most — a second patient account cannot read/update/delete another
  patient's family member (`NotFoundError`, not silently succeeding).
- Verified over real HTTP against `next dev`: full profile PATCH, family
  member POST/GET/PATCH/DELETE round-trip, and confirmed an authenticated
  ADMIN session gets a real 403 (not a silent pass-through) hitting a
  PATIENT-only route.
- Docker stack rebuilt and re-verified healthy with the new routes.

## Next up

Phase 3: doctor onboarding, verification, clinics, availability, public
discovery. Its domain logic is already fully specified in
`docs/DECISIONS.md` D3 since the Sprint 3 behavior is being ported, not
designed fresh — should move faster than Phase 2 despite being larger in
surface area.
