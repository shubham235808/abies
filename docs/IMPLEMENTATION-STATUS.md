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

## Next up

Phase 1: auth (OTP + HTTP-only cookie session), RBAC, admin MFA, consent,
audit, user management — porting the validated Sprint 2/3 behavior per
`docs/DECISIONS.md` D3 and `docs/SECURITY-MODEL.md`.
