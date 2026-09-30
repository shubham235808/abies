# Expansion Target Architecture — Four Deployables

Companion to `docs/EXPANSION-GAP-ANALYSIS.md`. This is the highest-risk
single item in the whole expansion — re-architecting a working, deployed,
15-stage-proven monolith — so the migration strategy gets written down
before any file moves, per this project's own established discipline.

## Current state (unchanged by anything in this document until Phase 1 of the implementation plan runs)

One Next.js 16 App Router application. Route groups already cleanly
separate each portal (`src/app/(public)`, `src/app/patient`,
`src/app/doctor`, `src/app/lab`, `src/app/pharmacy`,
`src/app/panchakarma-centre`, `src/app/customer-support`,
`src/app/tech-support`, `src/app/sales`, `src/app/care-coordination`,
`src/app/admin`), `src/app/api/*` holds every route handler, and
`src/modules/*` holds every service function. Server Components call
service functions directly (no network hop); client components call
`/api/*` through `src/lib/api-client.ts`.

## Target: four deployables, one shared domain package

```
apps/
├── client-web/       # Public site + Patient portal
├── partner-web/       # Doctor + Lab + Pharmacy + Panchakarma Centre portals
├── management-web/    # Admin + Customer Support + Tech Support + Sales +
│                       # Care Coordinator + Hospital Ops + Finance/Settlement
└── platform-api/      # Every route.ts handler — the only thing any client
                        # component's fetch() ever calls

packages/
├── domain/             # Prisma schema/client + every src/modules/* service
│                        # function + src/server/* (rbac, audit, session,
│                        # permissions) + src/lib/* (storage, payments,
│                        # notifications, logger) — pure Node, framework-
│                        # agnostic, no Next.js import
├── design-system/       # src/components/ui/* + globals.css tokens
└── shared-types/        # Zod schemas + inferred types shared across apps

workers/                 # Prepared, not required for UAT — settlement-cycle
                          # close, notification dispatch, report generation
                          # can move here once they exist as real background
                          # jobs rather than request-time work
```

### Why Server Components keep calling `@abies/domain` directly (not a network hop)

The master prompt frames `platform-api` as what "every route calls" —
the literal reading would have `client-web`'s Server Components `fetch()`
`platform-api` over HTTP even for a plain page render, turning every
`await listMineAsPatient(userId)` call across ~150 existing pages into an
HTTP round-trip. That's not what makes an architecture "API-first" in any
way that matters here, and Enhanced Blueprint §18 explicitly warns
against exactly this kind of premature service-splitting cost. Instead:

- **Server Components** (page renders, the majority of read traffic) import
  `@abies/domain`'s service functions directly, exactly as today —
  zero behavior change, zero rewrite risk, because this is still one
  process's memory space at request time even though it's now a separate
  deployable artifact from `platform-api`.
- **Client Components** (every mutation, every `api.post/patch/delete`
  call) hit `platform-api`'s routes over HTTP — also exactly as today,
  since that's already how they work (`src/lib/api-client.ts` already
  does `fetch('/api/...')`, not a direct import).

The only real change client/partner/management-web's code needs is
`fetch('/api/...')` → `fetch(process.env.NEXT_PUBLIC_API_BASE + '/...')`
(or a same-origin path prefix — see routing below, which avoids even
that). This is the mechanical, low-risk interpretation of "four
deployables" — genuinely separate build/deploy/scale units, without
inventing an HTTP hop for the 90% of traffic that's server-rendered reads.

### Routing: one origin, path-prefixed — not four subdomains

No real production domain exists yet (`docs/SECURITY-REVIEW.md`'s own
"what this phase did not do" section confirms this). Subdomain-based
routing (`app.`, `partner.`, `ops.`, `api.`) would need session cookies
scoped to a shared parent domain (`sessionCookieOptions` would need an
explicit `domain` attribute, currently absent) and DNS that doesn't
exist. Path-prefix routing behind the **existing single Nginx origin**
needs neither:

```
/            → client-web
/partner/*   → partner-web
/ops/*       → management-web
/api/*       → platform-api
```

Session cookies stay exactly as they are (host-only, no `domain`
attribute) since everything still shares one origin from the browser's
perspective. This is the lowest-risk routing choice and matches how
Nginx already fronts the app today (`infra/nginx/abies.conf`) — it needs
new `location` blocks, not a new TLS/DNS story.

### Auth/session across four processes

All four apps read the same session cookie and validate it the same way
(`@abies/domain`'s `requireSession`/`requireRole`/`requireAdminMfa`,
unchanged). Since `PostgreSQL` (sessions table) and `Redis` are shared
infrastructure already, no new session-sharing mechanism is needed — this
was never an in-memory session store.

### Migration mechanics (once Phase 1 of the implementation plan starts)

1. Turn the repo into a workspace (pnpm workspaces + Turborepo — already
   the pattern the IT Stack presentation itself gestures at with "Node.js
   monorepo tooling"; avoids inventing an unfamiliar build tool).
2. Move `src/modules/*`, `src/server/*`, `src/lib/*`, `prisma/*` into
   `packages/domain` unchanged — a pure file move plus import-path
   updates, no logic rewrite.
3. Move `src/components/ui/*` + `src/app/globals.css`'s tokens into
   `packages/design-system`.
4. Create four thin Next.js apps, each with only its own route groups
   under `src/app/`, each depending on `@abies/domain` and
   `@abies/design-system` as workspace packages.
5. `platform-api`'s `src/app/` becomes `src/app/api/*` only — no pages.
6. Update `docker-compose.yml`: one service per app (four `app` services
   instead of one), all still pointing at the same Postgres/Redis/MinIO.
   Nginx gets the four new `location` blocks above.
7. Regression-verify every portal against the new topology before
   retiring the single-app deployment.

### What does *not* change

- The database schema (this migration is purely a code/deployment
  reorganization — `EXPANSION-DOMAIN-MODEL.md`'s new tables are additive
  regardless of which app ends up calling them).
- RBAC, sessions, audit, rate-limiting — all already framework-agnostic
  logic in `src/server/*`, moves into `packages/domain` unchanged.
- The Docker/Postgres/Redis/MinIO topology's data layer.

### Kubernetes-readiness (prepare, do not implement — matches the master prompt's own explicit exclusion)

Four independently-deployable Next.js apps behind one Nginx origin is
already most of the way to "stateless application containers, no local
filesystem dependency for durable data, health/readiness endpoints,
externalized secrets" the master prompt's Section 27 asks to prepare for.
No Helm/Argo/Tekton work happens in this expansion.
