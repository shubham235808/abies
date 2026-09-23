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

## 2026-09-23 — Session 1 (continued): the public website

Completed the "website" half of "develop proper website and application
both" — the brief's full public-site route list now exists.

- **Real, working pages**: `/doctors` (live search against the Phase 3
  discovery API — text/city/specialty/language filters that update the URL,
  server-rendered results) and `/doctors/[slug]` (full public profile:
  bio, registration, clinics, availability). Both driven by real seeded and
  test data, not mocks.
- **Honest content pages** (no fake interactivity per the brief's policy):
  `/about`, `/diagnostics`, `/medicines`, `/panchakarma`, `/partners`,
  `/support` — real descriptive copy drawn from the Enhanced Blueprint,
  each with a plain "this isn't bookable/connected yet" notice where the
  backing module doesn't exist yet (Phases 7–10).
- **`/privacy` and `/terms`**: deliberately did not draft binding legal
  text — the brief's own blueprint says clinical/legal claims need real
  review. Instead these render the actual active `ConsentArtifact` rows
  from the database (key/version/required), with an explicit "pending
  legal review" notice. Real data, honestly framed, not fabricated legal
  copy.
- **`/contact`**: same honesty principle — no fake contact form or
  invented email address that would go nowhere; states plainly that the
  support console isn't connected yet.
- Added `SiteHeader` nav links and a `SiteFooter` (Platform/Company/Legal
  columns) tying all the new pages together; updated the homepage hero to
  replace the outdated "sign-in coming soon" badge with real CTAs to
  `/doctors` and `/login` now that both work, keeping only appointment
  booking honestly labeled "coming soon".

### Two more real bugs found via testing, not inspection

1. **Every portal page showed two stacked headers.** The root layout
   rendered `SiteHeader` unconditionally for all routes, and `PortalShell`
   renders its own header — both fired on `/patient`, `/doctor`, `/admin`.
   Caught in a screenshot, not by reading the code. Fixed by moving
   `SiteHeader` out of the root layout into `(public)/layout.tsx` and
   `(auth)/layout.tsx` specifically, matching Next's route-group layout
   model, and confirmed fixed with another screenshot.
2. **The Docker build failed outright** (not just noisy logs) the first
   time `/privacy`, `/terms`, `/doctors` and `/doctors/[slug]` existed —
   `next build`'s static-generation phase tried to prerender them at build
   time, and they call Prisma directly (no `cookies()`/`headers()` call to
   implicitly signal "dynamic" the way the portal pages do), so the
   isolated build stage's `ECONNREFUSED` to a nonexistent `postgres` host
   killed the build. Fixed with `export const dynamic = 'force-dynamic'`
   on all four — which is also the semantically correct choice regardless,
   since live search results and consent-artifact versions must never be
   baked into a static build.

Also moved the homepage from `src/app/page.tsx` into
`src/app/(public)/page.tsx` for consistency with the rest of the public
site route group (route groups don't affect the URL, `/` is unchanged).

Verified with a full Playwright walkthrough (home, doctor search + filter,
doctor profile, about, privacy, panchakarma, and a portal page to confirm
the header fix) against `next dev`, then `lint`/`typecheck`/`vitest`/
`next build` locally, then — critically, since this is what caught the
build-time DB bug — a full Docker image rebuild, which now succeeds and
serves all pages correctly.

## Phase 4 — Appointments, payments, notifications

Net-new design per `docs/DOMAIN-MODEL.md` §4/§11/§13 — no Sprint 2/3
baseline to port here. Schema: `AppointmentSlot`, `Appointment`, `Payment`,
`Notification` (two migrations — `phase4_appointments_payments_notifications`,
then `fix_appointment_slot_not_unique`, see bug #1 below). Also added
`DoctorAvailability.clinicId` (required for CLINIC-mode windows), closing
a gap flagged in a Phase 3 code comment ("tracked as a follow-up for
whichever phase adds appointment-slot generation").

- **Slot generation is on-demand, not pre-materialized** — computed from
  `DoctorAvailability` windows for the next N days
  (`modules/appointments/appointments.service.ts` `listAvailableSlots`),
  overlaid against whatever `AppointmentSlot` rows already exist for that
  doctor to exclude `BOOKED` slots and still-`HELD` ones.
- **Double-booking prevention**: `holdSlot()` claims a slot inside a
  transaction — create it `HELD` if the row doesn't exist yet, or a
  conditional `updateMany` (`WHERE status='OPEN' OR (status='HELD' AND
  heldUntil < now)`) if it does. Postgres's row lock on the `UPDATE` itself
  is what actually serializes concurrent holds under default READ
  COMMITTED — no `SELECT ... FOR UPDATE` needed. A 10-minute hold expires
  lazily (checked at the next hold attempt, not swept by a job).
- **Payments (Razorpay)**: `src/lib/payments/razorpay.ts` — real adapter
  using the `razorpay` npm SDK, `verifiedAt` set only via server-side HMAC
  signature verification (checkout callback) or the webhook path
  (`/api/payments/webhook/razorpay`), never a bare client callback, per the
  blueprint's explicit rule. `RAZORPAY_KEY_ID`/`_KEY_SECRET` are blank in
  this environment (no real account provisioned yet) — `isConfigured()`
  gates `holdSlot()` and returns an honest 503 rather than faking an order,
  same "hard fail, don't fake it" rule already used for admin MFA in
  production. **Booking is code-complete but not live-testable end-to-end
  until real (even test-mode) Razorpay keys are supplied.**
- **Notifications**: adapter interface + a `mock` provider (console log)
  behind `SMS_PROVIDER`/`EMAIL_PROVIDER`/`WHATSAPP_PROVIDER`, matching the
  placeholders `.env.example` already shipped in Phase 0. `mock` is
  hard-disabled in production (mirrors the `OTP_DEV_CODE` rule) — no
  channel silently claims delivery without a real provider configured. No
  real SMS/email/WhatsApp provider is wired up yet; `IN_APP` is the only
  channel that's fully real today (the DB row itself is the delivery).
- **UI**: booking widget on the public doctor profile page (mode picker,
  date/slot grid, family-member/reason form, Razorpay Checkout.js loaded
  on demand — not bundled, not loaded for anonymous visitors); real
  `/patient/appointments` and `/doctor/appointments` lists with cancel;
  patient/doctor dashboards' "Next appointment" cards are no longer
  "coming soon" — they show a live upcoming count. Homepage's "Appointment
  booking — coming soon" badge removed now that it's real.
- Integration tests (`tests/integration/appointments.test.ts`): double-hold
  conflict, Razorpay-not-configured refusal, valid/invalid signature
  verification, cancel-and-rebook. Razorpay's own HTTP call is mocked
  (there's no way to hit the real gateway without an account); everything
  else — Postgres transactions, the hold/confirm/cancel state machine — runs
  for real.

### Two real bugs found via testing, not inspection

1. **`Appointment.slotId` was `@unique`**, which silently made a slot
   unbookable forever after its first appointment was cancelled — the
   unique constraint blocked a second `Appointment` row from ever
   referencing that `AppointmentSlot` again, even though the slot's own
   `status` had correctly reset to `OPEN`. Caught by an integration test
   (`cancel → rebook the same slot`) that failed with a Prisma unique
   constraint error, not by reading the schema. The concurrency guarantee
   was never supposed to live on this FK — it lives entirely in
   `AppointmentSlot.status` plus the conditional-update hold logic. Fixed
   by dropping `@unique` (migration `fix_appointment_slot_not_unique`) and
   changing `AppointmentSlot.appointment` from a one-to-one to a
   one-to-many `appointments[]` relation to match.
2. **`holdSlot()` returned a stale `appointment` object** — captured from
   `tx.appointment.create()` before the follow-up `tx.appointment.update()`
   that sets `paymentId`, so the value handed back to the API response (and
   almost silently to this test suite, via `appointment.paymentId!`) still
   had `paymentId: null`. Fixed by capturing the `update()`'s return value
   instead of reusing the pre-update object.

Verified: `tsc --noEmit`, `eslint .`, `vitest run` (27/27, was 21/21 before
this phase) all clean; `next build` locally (all four new routes correctly
render `ƒ` dynamic); full Docker image rebuild succeeded; container health
check and curl smoke tests against the live container
(`/api/appointments/slots` → 401 unauthenticated, webhook → 400 unsigned);
a real Playwright walkthrough against `next dev` with a seeded
approved-doctor + patient account confirmed: anonymous visitors see a
login prompt instead of the booking widget, a logged-in patient can browse
real generated slots and reach the honest "payments are not configured"
error on checkout, and `/patient/appointments` renders. All seed/demo
accounts created for that walkthrough were deleted afterward — nothing
fake was left in the dev database.

## Next up

Phase 5: consultations, clinical notes, prescriptions
(`docs/DOMAIN-MODEL.md` §5) — also net-new, and the natural next step once
an appointment can be confirmed. Outstanding from earlier phases, still
unresolved: real Ubuntu ESXi VM SSH details for Phase 12 deployment, and
real (even test-mode) Razorpay/SMS/email/WhatsApp credentials so Phase 4's
booking flow can be exercised end-to-end rather than stopping at the
honest "not configured" message.
