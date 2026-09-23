# ABIES Ayurveda Care Platform

A trusted digital care network connecting patients, verified Ayurveda
practitioners, diagnostics, medicines and Panchakarma services through one
coordinated treatment journey.

Built as a Next.js modular monolith. See `docs/` for the full design:

- [`docs/CURRENT-STATE.md`](docs/CURRENT-STATE.md) — what's real vs. spec-only
- [`docs/TARGET-ARCHITECTURE.md`](docs/TARGET-ARCHITECTURE.md) — stack, module boundaries, deployment
- [`docs/DOMAIN-MODEL.md`](docs/DOMAIN-MODEL.md) — entities, state machines
- [`docs/IMPLEMENTATION-PLAN.md`](docs/IMPLEMENTATION-PLAN.md) — phase-by-phase build order
- [`docs/IMPLEMENTATION-STATUS.md`](docs/IMPLEMENTATION-STATUS.md) — current progress
- [`docs/DECISIONS.md`](docs/DECISIONS.md) — decisions made where sources conflicted
- [`docs/SECURITY-MODEL.md`](docs/SECURITY-MODEL.md) — auth, RBAC, MFA, audit, data protection

## Getting started (local development)

```bash
cp .env.example .env
# generate real secrets:
openssl rand -hex 32   # -> SESSION_SECRET
openssl rand -hex 32   # -> OTP_PEPPER

docker compose up -d postgres redis minio
npm install
npm run prisma:migrate
npm run prisma:seed
npm run dev
```

App runs at http://localhost:3000. Health checks: `/api/health` (liveness),
`/api/ready` (dependency checks).

Full stack, including the app container itself:

```bash
docker compose up --build
```

## Development accounts (seeded, non-production only)

| Role | Mobile | OTP |
|---|---|---|
| Patient | +919876543210 | 123456 |
| Doctor (approved, discoverable) | +919876543211 | 123456 |
| Admin | +919876543214 | 123456 (MFA: 654321) |

These codes only work when `NODE_ENV !== production`; the dev bypass is
hard-disabled in production (see `docs/SECURITY-MODEL.md`).

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Start Next.js dev server |
| `npm run build` | Production build |
| `npm run lint` / `npm run typecheck` | Static checks |
| `npm test` | Unit/integration tests (Vitest) |
| `npm run test:e2e` | End-to-end tests (Playwright) |
| `npm run prisma:migrate` | Create/apply a dev migration |
| `npm run prisma:seed` | Load development seed data |

## Status

Phase 0 (repository scaffold) — see `docs/IMPLEMENTATION-STATUS.md` for the
current phase and what's next.
