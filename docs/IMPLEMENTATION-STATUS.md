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

## 2026-09-23 — Session 1 (continued): Phase 3 complete (doctor network)

- `src/modules/doctors/doctors.service.ts` — doctor-owned profile/document/
  clinic/availability management, porting Sprint 3's exact rules: slug
  generation from name (falls back to `doctor-<id6>` until named), edit-lock
  outside DRAFT/REJECTED, re-editing a REJECTED profile resets it to DRAFT
  and clears the rejection reason, availability mode gated by the profile's
  enabled `consultationModes`, the full submission checklist, and the public
  trust rule (`APPROVED AND isDiscoverable` only). Document uploads now go
  through `src/lib/storage.ts` into real MinIO (Sprint 3 wrote to local
  disk) — validated MIME/size, UUID-prefixed object keys scoped per doctor,
  signed download URLs only, nothing public.
- `src/modules/doctors/admin-doctors.service.ts` — verification queue,
  detail, start-review/approve/reject/suspend, document review. Approval
  still hard-requires both the registration certificate and degree
  certificate to be individually `VERIFIED` first. Every transition writes
  both a `DoctorVerificationAction` row and a general `AuditEvent`.
- Routes: doctor portal under `/api/doctors/me/*` (profile, documents
  incl. multipart upload via `request.formData()`, clinics, availability,
  submit), admin under `/api/admin/doctors/*` (all gated by
  `requireAdminMfa`, matching Sprint 3's blanket MFA requirement on the
  whole admin-doctors surface — broader than this doc's earlier "privileged
  actions only" framing, D3 precedence wins), public under
  `/api/public/doctors/*` (search, facets, profile by slug).
- **Real bug found and fixed, not inherited silently:** Sprint 3's search
  matched the *entire* query string against one field at a time
  (`firstName contains q` OR `lastName contains q` OR ...), so a natural
  two-word query like "Arjun Nair" never matched anything — neither field
  alone contains the full two-word string. Fixed by splitting the query
  into words and requiring each word to match at least one field
  (AND-of-ORs). Caught by an integration test, not by inspection — worth
  remembering when porting the rest of Sprint 3's search-style endpoints
  later (medicines, diagnostics, panchakarma catalogues will have the same
  shape).
- 6 new integration tests: incomplete-submission rejection, edit-lock +
  reject-resets-to-draft, availability mode-gating, clinic ownership
  scoping, the dual-document-verified-before-approve gate (including the
  "one of two verified still fails" case), and the full
  discoverable-on-approve / hidden-on-suspend visibility cycle (this is the
  test that caught the search bug above).
- Full manual HTTP walkthrough against `next dev`: doctor fills profile →
  adds clinic + availability → uploads two real PDF files (verified they
  land in MinIO and a signed URL actually serves the file content back) →
  submits → admin queue shows it → start-review → approve blocked until
  both documents verified → approve succeeds → public search finds it by
  full name and by city → public profile by slug → facets include it →
  confirmed a PATIENT session gets a real 403 on doctor-only routes.
- Docker stack rebuilt and re-verified healthy with all 34 routes.
- Noted, not investigated further: `@prisma/adapter-pg` (via `pg`) emits an
  "already executing a query" deprecation warning during some test runs.
  Confirmed the adapter uses a real `pg.Pool` internally (not a bare
  `Client`), so this looks cosmetic rather than a correctness issue — no
  test flakiness observed across multiple runs — but worth a closer look if
  it ever correlates with an actual failure.

## 2026-09-23 — Session 1 (continued): real brand colors, not placeholders

User flagged that the homepage wasn't using the actual ABIES brand colors —
the Phase 0 palette in `src/app/globals.css` was a guess, never actually
sampled from `ABIES_Agent_Knowledge_Pack/05_Brand/ABIES_logo.jpg`.

- Installed `python3-pil` (not present) and sampled the logo's dominant
  colors directly via k-bucket clustering rather than guessing again:
  magenta `#C4006E`, purple `#7A1783`, blue `#1F86C8`, orange `#F07800`.
  Generated full 50–900 tint/shade scales by mixing each toward white/
  near-black (not HSL lightness-push, which turned the saturated magenta/
  purple muddy) — replaced the placeholder palette in `globals.css`.
- Cropped a clean, tightly-bounded version of just the mark (not the full
  lockup) from the source logo for `src/app/icon.png` (Next's auto-favicon
  convention) and `public/abies-mark.png` (header use).
- Added `src/components/layouts/site-header.tsx` (logo + wordmark, used
  from `layout.tsx` — the first shared layout component, matching
  `docs/TARGET-ARCHITECTURE.md`'s `components/layouts/` convention) and
  redesigned the homepage to actually use the brand colors meaningfully:
  gradient hero background, gradient-text accent on the headline, and four
  pillar cards each carrying one of the mark's four colors on a small icon
  chip — mirroring the logo's own purple/magenta/blue/orange swirl
  structure instead of being arbitrary.
- Verified with a real Playwright screenshot at both desktop (1280px) and
  mobile (390px) viewports against the rebuilt Docker container — not just
  "the code should render this."

## 2026-09-23 — Session 1 (continued): real UI for the public site and portals

User asked to build out the actual website/application UI, not just APIs.
Built the full authenticated front-end for everything Phases 1–3 already
support, on top of the brand redesign from the previous entry.

- **Design system** (`src/components/ui/`): Button, Input/Textarea/Select/
  Label/FieldError, Card, Badge (incl. a `VerificationBadge` mapping the
  doctor status enum to a tone), Alert — all driven by the real brand
  tokens, no ad hoc colors per page.
- **Auth client infra**: `src/lib/api-client.ts` (typed fetch wrapper,
  `ApiError` with Zod issue detail), `src/server/current-user.ts`
  (`getCurrentSession` for read-only Server Component use, distinct from
  route handlers' rotating `requireSession`).
- **`/login`** (`src/app/(auth)/login/page.tsx`): full 3-step OTP + admin-MFA
  flow against the real Phase 1 API, React Hook Form + Zod throughout, dev
  OTP shown inline in non-production. Redirects by role to the right portal.
- **`src/components/layouts/portal-shell.tsx`**: shared authenticated shell
  (server-side role + MFA gate, sidebar nav on desktop / horizontal scroll
  nav on mobile, sign-out). Every portal layout is a two-line wrapper
  around it.
- **Patient portal**: dashboard (real profile/family data + honestly-labeled
  "coming soon" cards for appointments/care-plan/diagnostics/medicines),
  profile edit form, family member CRUD.
- **Doctor portal**: overview (status, completion %, verification history),
  profile edit form (locked outside DRAFT/REJECTED, matching the backend
  rule), document upload/list/delete (real MinIO round-trip through the
  browser), clinics CRUD, availability CRUD (mode-gated to what's enabled
  on the profile), submit-for-verification.
- **Admin portal**: verification queue with status tabs, full review panel
  (approve/reject/suspend/start-review, per-document verify/reject with
  signed-URL "View", verification history) — gated by `requireMfa` on the
  portal shell in addition to the API's own `requireAdminMfa`, and a
  standalone `/login/mfa` page to resume an admin session that never
  finished its MFA step.

### Real bugs found via actual browser testing, not just unit tests

Ran full Playwright walkthroughs (patient, doctor, admin) against the real
Docker stack, not just `npx tsc`/lint — this is what surfaced all four of
these, none of which the test suite or type system caught on their own:

1. **`isoDate` Zod schema rejected empty-string dates from HTML `<input
   type="date">`**, silently blocking `zodResolver` from ever calling the
   submit handler (react-hook-form swallows the validation failure — no
   network request, no visible error unless the specific field renders
   one). Root-caused and fixed in the shared schema
   (`src/modules/patients/patients.schemas.ts`), not papered over per-form,
   since every optional-date form shares it.
2. **`session!.userId` non-null assertions crashed 8 Server Component
   pages** the one time the page's own independent `getCurrentSession()`
   call raced against the layout's — the layout and page each make their
   own session lookup; a layout-level auth check is not a guarantee for
   the page. Fixed by adding `requireSessionOrRedirect()` and using it
   everywhere instead of asserting.
3. **`/admin` 404'd** — the admin portal had a layout and nav pointing at
   `/admin/doctors`, but no `/admin/page.tsx`, so the MFA-complete redirect
   target landed nowhere. Added an index redirect.
4. Investigated a persistent Next.js dev-overlay "1 Issue" badge down to a
   React hydration-mismatch warning on a checkbox's `caret-color` style;
   confirmed `caret` appears nowhere in the codebase and the warning never
   reproduced on an isolated single-page visit, only after many scripted
   Playwright `.check()`/`.fill()` interactions in one session — logged as
   a browser-automation artifact, not an app defect, rather than chased
   further or silently ignored.

Also removed the speculative `clinicId` field from the availability Zod
schema before building UI around it — it had no backing Prisma column
(TypeScript didn't catch the mismatch because object-spread into Prisma's
`.create()` call bypasses excess-property checking). Matches the validated
Sprint 3 baseline, which also never linked a slot to a specific clinic;
tracked as a real follow-up for whenever appointment-slot generation needs
to know which physical location a CLINIC-mode slot is at.

All of the above verified with real Playwright walkthroughs (screenshots at
desktop and captured console/pageerror output) against `next dev`, then a
full `lint`/`typecheck`/`vitest`/`next build` pass, then the Docker image
rebuilt and re-verified healthy and serving the new pages.

## Next up

Phase 4: appointment scheduling (slot locking to prevent double-booking),
payments (Razorpay adapter, server-side signature verification), and
notifications (SMS/email/WhatsApp adapters). This is genuinely new design
per `docs/DOMAIN-MODEL.md` §4 and §11 — Sprint 2/3 explicitly stopped short
of appointments ("intentionally left for Sprint 4"), so there's no
validated baseline to port here, unlike Phases 1–3.
