# Implementation Plan

Maps the brief's 12-phase build order onto the Enhanced Blueprint's 12-sprint
delivery plan and the Sprint 2/3 work already validated (Current State). Each
phase ends with the testing gate from the brief's "Testing Requirements"
(TypeScript, lint, unit, integration, E2E, build all green before moving on)
plus its own Definition-of-Done checklist from the brief.

Delivery shape: phase-by-phase across sessions (D5). Each phase is scoped to
fit one Workflow run plus review, not the whole platform at once.

| Phase (brief) | ≈ Blueprint Sprint | Scope | Status |
|---|---|---|---|
| 0 | — | Repo scaffold, Next.js/Prisma/Docker skeleton, design system foundation | **Next up** |
| 1 | 1–2 | Auth (OTP+cookie), RBAC, MFA, consent, audit, user management | Not started — ports validated D3 logic |
| 2 | 2 | Patient profile, family members | Not started — ports validated D3 logic |
| 3 | 3 | Doctor onboarding, verification, clinics, availability, public discovery | Not started — ports validated D3 logic |
| 4 | 4 | Appointment scheduling, payments, notifications | Not started — net new |
| 5 | 5 | Consultations, clinical notes, prescriptions | Not started — net new |
| 6 | 5 | Care Plan Engine | Not started — net new, central module |
| 7 | 9 | Diagnostics + reports + lab portal | Not started — net new |
| 8 | 6 | Medicines + pharmacy portal | Not started — net new |
| 9 | 10 | Panchakarma + centre portal | Not started — net new |
| 10 | 7 | Support / Tech Support / Sales / Care Coordination CRM | Not started — net new |
| 11 | 8 | Admin operations, reporting, audit | Not started — net new |
| 12 | 11–12 | Security hardening, performance, observability, backup, deployment | Not started — net new |

Phases 1–3 are lower-risk than the brief's ordering implies: the business
rules are already implemented and tested in Sprint 2/3 (D3). The work there
is porting/re-implementing in the Next.js module structure, not designing
from scratch — so they should move faster than phases 4+.

## Phase 0 — Architecture + repository setup

- `package.json`, TypeScript config, Next.js App Router skeleton, Tailwind +
  design tokens (ABIES palette).
- `prisma/schema.prisma` seeded from the Sprint 3 baseline entities
  (§1–3 of `docs/DOMAIN-MODEL.md`) plus the net-new entities needed by Phase
  1–3 only (Payments/Diagnostics/etc. schema lands in their own phases to
  keep each migration reviewable).
- `docker-compose.yml` (Postgres, Redis, MinIO, app) for local dev;
  `docker-compose.prod.yml` stub for the Ubuntu ESXi target.
- `lib/db`, `lib/redis`, `lib/storage` adapters; `server/session`,
  `server/rbac`, `server/audit` scaffolds (empty behavior, Phase 1 fills
  them in).
- `.env.example`, base ESLint/Prettier/Vitest/Playwright config, CI workflow
  skeleton (install/lint/typecheck/test/build).
- `docs/SECURITY-MODEL.md` written before any auth code, per the brief's
  "First Deliverable" ordering.
- Exit criteria: `npm run build` succeeds on an empty-but-wired app; `docker
  compose up` brings up all four services with passing health checks.

## Phases 1–3 — Identity, patients, doctor network

Port D3's validated behavior into the module structure from
`docs/TARGET-ARCHITECTURE.md`:
- `modules/auth`: OTP request/verify, cookie session issuance, refresh,
  logout, admin MFA challenge — same rules (cooldown, max attempts, HMAC
  pepper, role-gated provisioning, dev-bypass forbidden in prod).
- `modules/audit`: interceptor-equivalent — a `withAudit()` wrapper called
  from server actions/route handlers, since Next.js has no NestJS
  interceptor mechanism.
- `modules/consent`: artifact listing, accept-on-verify, per-user history.
- `modules/patients`: profile + family member CRUD, extended fields from
  `docs/DOMAIN-MODEL.md` §2.
- `modules/doctors`: profile, documents (upload validation, edit-lock by
  status), clinics, availability (mode-gated by profile), submit checklist,
  admin verification queue + actions, public discovery + facets.
- Public site pages that read from `modules/doctors`' public API:
  `/`, `/doctors`, `/doctors/[slug]`.
- Test plan: re-run the scenarios in Sprint 3's `SPRINT3_TEST_PLAN.md`
  against the new implementation as an integration-test baseline, plus new
  cookie-session-specific tests.

## Phases 4–11

Each phase follows the brief's Definition of Done per feature (schema +
migration, permissions, UI, backend, validation, empty/loading/error states,
security review, unit/integration/E2E tests, responsive, accessible, docs
updated) and the entities/state machines already specified in
`docs/DOMAIN-MODEL.md` §4–13. Detailed task breakdowns are written at the
start of each phase (not all up front), since later phases' UI/API details
depend on decisions made in earlier phases (e.g., the notification adapter
built in Phase 4 is reused by every later phase).

## Phase 12 — Hardening & deployment

Security review pass (OWASP checklist from the brief), load/perf pass,
`docs/BACKUP-RESTORE.md` + working backup/restore scripts, full
observability wiring, production `docker-compose.prod.yml`, deployment to
the Ubuntu ESXi target, and the 9 mandatory end-to-end tests from the brief
run against a deployed environment.

## Mandatory end-to-end tests (from the brief)

Tracked as Playwright suites in `tests/e2e/`, one file per test, added as the
phase that enables them completes (e.g., TEST 1 lands in Phase 1–2, TEST 9
lands in Phase 11):

1. Patient OTP login, profile update, family member
2. Doctor onboarding → admin verification → public discovery
3. Patient finds doctor, books slot, pays, appointment confirmed
4. Doctor consultation → notes → prescription → care plan; patient sees plan
5. Doctor recommends diagnostic → patient books → lab collects/reports →
   patient & doctor view report
6. Prescription → medicine order → pharmacy accepts → dispatch → delivery
7. Panchakarma: doctor recommends → patient books → centre schedules →
   sessions completed
8. Patient opens support ticket → support resolves
9. Admin confirms audit trail for the above actions

## Immediate next step

Phase 0 scaffold. Before generating it, confirm with the user: (a) they're
happy with the domain model / architecture decisions above (especially the
cookie-session deviation from Sprint 2/3 and the Payment/CarePlan schema
shape), and (b) any Phase 0 environment specifics (Ubuntu VM SSH access,
whether a Razorpay/SMS/WhatsApp/video sandbox credential set already exists
or should stay stubbed behind adapters for now).
