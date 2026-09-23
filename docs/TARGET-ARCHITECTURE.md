# Target Architecture

Source: Enhanced Blueprint §18 (Reference Technical Architecture), IT Stack
Presentation (all slides), and D3/D6 in `docs/DECISIONS.md`.

## Shape: modular monolith, not microservices

One repository, one Next.js application, one PostgreSQL database. Modules are
separated by folder/ownership boundaries so they *could* be split into
services later, but nothing is deployed separately at MVP. This is an
explicit, repeated recommendation in both the blueprint ("begin as a
well-structured modular monolith... split services only where scale/ownership
justifies it") and the IT Stack deck ("Do not start with over-complex
microservices").

```
                    Internet
                       │
                       ▼
                Nginx (reverse proxy, TLS termination, static cache)
                       │
                       ▼
                 Next.js application (App Router)
                       │
        ┌──────────────┼────────────────┐
        │              │                │
        ▼              ▼                ▼
   Server Components  Route Handlers   Background jobs
   (portal UIs)       + Server Actions (BullMQ workers on Redis)
        │              │                │
        └──────────────┼────────────────┘
                       │
                       ▼
                 Prisma ORM
                       │
                       ▼
                  PostgreSQL 16
                       │
           ┌───────────┼─────────────┐
           ▼           ▼             ▼
      MinIO/S3      Redis        External adapters
   (private docs,  (sessions,   (Razorpay, SMS/email/
    reports, etc.)  OTP, queue,  WhatsApp, video, maps,
                     rate limit)  logistics, ABDM-ready)
```

Only Nginx is exposed publicly. PostgreSQL, Redis, and MinIO are on the
internal Docker network only.

## Technology stack

| Concern | Choice | Notes |
|---|---|---|
| App framework | Next.js (App Router) + React + TypeScript | Server Components by default; Client Components only where interactivity requires it |
| Styling | Tailwind CSS + internal design system | ABIES brand palette (see below) |
| Data fetching | Server Components for reads; TanStack Query for authenticated interactive client state | Avoid client-side fetch waterfalls for initial page data |
| Forms | React Hook Form + Zod resolvers | Same Zod schemas reused for server-side validation |
| ORM / DB | Prisma + PostgreSQL 16 | Single schema, module-namespaced models |
| Cache / queue / rate limit / OTP state | Redis | BullMQ for background jobs |
| Object storage | S3-compatible abstraction; MinIO for self-hosted dev/prod | Signed URLs only; nothing public by default |
| Auth | OTP (mobile-first), HTTP-only cookie session, RBAC, admin MFA | Behavior ported from Sprint 2/3 (D3), cookie-based instead of bearer-in-body (see Auth section) |
| Payments | Razorpay via internal adapter | Server-side signature verification only |
| Video | Provider-agnostic adapter interface | No vendor hardcoded into domain logic |
| Notifications | SMS / email / WhatsApp / push adapters | Template-governed, queued via Redis |
| Testing | Vitest (unit/integration), React Testing Library, Playwright (E2E) | Per-module `tests/` plus root `tests/e2e` |
| Infra | Docker, Docker Compose, Nginx, Ubuntu VM (ESXi target, host pattern `192.168.1.160`) | `docker-compose.yml` (dev) + `docker-compose.prod.yml` |
| Observability | Structured logs, request IDs, `/api/health`, `/api/ready`, OpenTelemetry-ready | Per IT Stack deck slide 12 |

## Why cookie session, not bearer token (deviation from Sprint 2/3)

Sprint 2/3 returned the access/refresh token pair in the JSON response body
for the client to store and replay (typical for a decoupled SPA talking to a
separate NestJS API). The brief mandates HTTP-only cookies and explicitly
forbids `localStorage` token storage. Since the target is a single Next.js
app (server and "API" are the same process), the session is carried as an
HTTP-only, `SameSite=Lax`, `Secure` cookie set by the route handler; Server
Components read the session via a server-only helper, never via a
client-exposed token. The underlying session semantics (hashed refresh
token, sliding expiry, `mfaVerified` flag, audit-on-transition) carry over
unchanged from D3.

## Repository structure

```
src/
├── app/
│   ├── (public)/            marketing site: /, /about, /doctors, /doctors/[slug],
│   │                        /diagnostics, /panchakarma, /medicines, /partners,
│   │                        /support, /contact, /privacy, /terms
│   ├── (auth)/              /login, OTP verify, MFA challenge
│   ├── patient/
│   ├── doctor/
│   ├── admin/
│   ├── lab/
│   ├── pharmacy/
│   ├── panchakarma-centre/
│   ├── support/             customer support console
│   ├── sales/                sales / partner ops console
│   ├── care-coordination/
│   └── api/                 route handlers: webhooks, file downloads, health
│
├── modules/                 one folder per domain module (see below)
├── components/{ui,layouts,shared}/
├── lib/                     cross-module: db client, redis, storage, adapters
├── server/                  session/auth helpers, RBAC, audit logger
├── hooks/
├── types/
└── styles/

prisma/{schema.prisma, migrations/, seed.ts}
tests/{unit,integration,e2e}
docs/
```

### Module boundaries (`src/modules/*`)

`auth`, `users`, `patients`, `doctors`, `appointments`, `consultations`,
`care-plans`, `diagnostics`, `reports`, `medicines`, `pharmacies`,
`panchakarma`, `payments`, `support`, `partners`, `notifications`, `audit`,
`consent`, `storage`.

Each module owns: domain types, Zod schemas, a repository/data-access layer
over Prisma, services (business logic, transactions), a permissions file
(who may call what), route handlers/server actions, module-scoped UI
components, and tests. Route handlers and Server Actions stay thin —
business logic lives in `services/`, matching D6.

## Portals (10) + public site

Patient, Doctor/Vaidya, Administrator, Diagnostic Lab, Pharmacy, Panchakarma
Centre, Customer Support, Technical Support, Sales/Partner Operations, Care
Coordinator — each an `app/<portal>/` route group sharing the same identity
platform, design system, audit framework, notification framework, patient
health record, care-plan model, and permission system (no per-portal forks
of these).

## Security posture (summary — full detail in `docs/SECURITY-MODEL.md`, written before Phase 1 code)

- RBAC enforced server-side on every route handler/server action, never
  frontend-only. Roles: `PATIENT, DOCTOR, ADMIN, LAB, PHARMACY,
  PANCHAKARMA_CENTRE, CUSTOMER_SUPPORT, TECH_SUPPORT, SALES,
  CARE_COORDINATOR`.
- Admin MFA required for privileged actions (doctor approval/suspension,
  partner suspension, refund approval, role change, audit access, sensitive
  config) — same `mfaVerified` session flag pattern as D3, extended to a real
  provider in production (Sprint 2/3's dev bypass is explicitly forbidden in
  prod and that constraint carries forward).
- Immutable audit log (actor, action, entity, entity ID, time, request ID,
  IP, metadata) for every sensitive action; PHI excluded from audit metadata.
- Versioned consent artifacts, same accept-on-verify pattern as D3, extended
  with explicit withdraw/re-consent flows for non-required artifacts.
- Private object storage by default; signed, time-limited download URLs;
  MIME/extension/size validation on upload (ported from Sprint 3's
  PDF/JPG/PNG allowlist, generalized per-module).
- Never trust client-confirmed payment state — Razorpay webhook signature
  verified server-side before any order/booking is marked paid.

## Deployment topology

```
Nginx (public :80/:443)
  → Next.js modular monolith (internal)
    → PostgreSQL (internal only)
    → Redis (internal only)
    → MinIO (internal only)
```

`docker-compose.yml` for local/dev, `docker-compose.prod.yml` for the Ubuntu
ESXi VM target. Persistent named volumes for Postgres, MinIO, and Redis AOF.
Migrations run automatically and safely on deploy (Prisma `migrate deploy`,
never `db push` in prod). Backup scripts for Postgres and object storage,
plus a documented restore/rollback procedure (`docs/BACKUP-RESTORE.md`,
written in Phase 12 per the implementation plan).

## Design system

ABIES brand palette: purple, magenta, blue, orange, white, neutral grey
(logo at `ABIES_Agent_Knowledge_Pack/05_Brand/ABIES_logo.jpg`). Qualities:
trusted, medical, premium, modern, calm, clean; avoid Ayurveda visual
clichés. WCAG AA target. Responsive breakpoints: 375 / 768 / 1024 / 1440px+;
desktop portals use sidebar + header + content, mobile uses a responsive
drawer/bottom nav.
