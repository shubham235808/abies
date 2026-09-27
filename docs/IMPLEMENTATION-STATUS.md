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

## Phase 5 — Consultations, clinical notes, prescriptions

Net-new per `docs/DOMAIN-MODEL.md` §5. Schema (one migration,
`phase5_consultations_notes_prescriptions`): `Consultation`,
`AssessmentTemplateField`, `ClinicalNote`, `VideoSession`, `Prescription`,
`PrescriptionItem`.

- **Every CONFIRMED appointment gets a `Consultation` row automatically** —
  wired into `finalizePaymentSuccessByOrder` in
  `modules/appointments/appointments.service.ts`, so there's always
  somewhere for the doctor to record notes. Cancelling a still-`SCHEDULED`
  consultation cancels it too (an already-started/finished one is left
  alone — appointment cancellation is only reachable from
  `PENDING_PAYMENT`/`CONFIRMED`, so this never touches real clinical work).
- **Doctor workspace** (`/doctor/consultations/[id]`): start/complete the
  visit, chief-complaint/HPI/notes, a clinical note form driven by
  `AssessmentTemplateField` (seeded with Prakriti/Vikriti/Agni/Koshta —
  configurable, not hard-coded into the schema, per the brief), and a
  prescription editor with a dynamic item list.
- **Immutability, for real**: `saveClinicalNote` throws once
  `finalizedAt` is set — no code path can edit a finalized note.
  `updatePrescription`/`createPrescription` only ever touch `DRAFT` rows;
  finalizing a prescription is one-way; "correcting" a `FINALIZED`
  prescription creates a brand-new `DRAFT` (seeded from the old item list)
  with `supersedesId` pointing at the original, which flips to
  `SUPERSEDED` in the same transaction — the original row and its items are
  never mutated. Covered by an integration test that finalizes, corrects,
  then re-reads the original row from the DB to confirm it's untouched.
- **Patient visibility is service-layer filtered, not just hidden in the
  UI**: `getConsultation` strips the doctor's private `notes` field, nulls
  out `clinicalNote` unless `finalizedAt` is set, and drops `DRAFT`
  prescriptions entirely for a patient caller — verified by an integration
  test that reads as the patient mid-consultation (sees nothing) and again
  after finalize (sees everything).
- **Video**: no real provider (Twilio/Daily/etc.) is connected — `VideoProvider`
  is a closed one-value (`MOCK`) enum on purpose, so adding a real one is a
  schema-visible decision, not a silent env-var flip. `src/lib/video`
  never fabricates a join URL; the UI shows the honest "not connected"
  message instead of a fake call window. What *is* real: a `VideoSession`
  row is created when a VIDEO consultation starts, and `doctorJoinedAt`/
  `patientJoinedAt` are recorded for real (idempotently) whenever either
  party opens the page — genuine audit data, not a fake call.
- Navigation: no new top-level "Consultations" nav item — a consultation
  is 1:1 with an appointment, so `/patient/appointments` and
  `/doctor/appointments` each link straight into it (label changes with
  status: "Start consultation" → "Continue consultation" → "View
  consultation notes & prescription").
- Integration tests (`tests/integration/consultations.test.ts`, 7 cases):
  auto-created-on-confirm, start creates a VideoSession, cross-doctor
  ownership refusal, complete cascades to the appointment, clinical-note
  visibility + immutability, prescription visibility + the
  finalize→correct→supersede chain.

### One real bug found via a live browser walkthrough, not by inspection

The prescription form's "Duration (days)" field used React Hook Form's
`valueAsNumber: true`, which converts an empty input to `NaN` — and
`z.number().int().optional()` rejects `NaN` (optional only excuses an
*absent* key, not an invalid one), so `zodResolver` silently refused to
call the submit handler whenever that field was left blank. No error
shown anywhere; the "Save draft" button just did nothing. This is the same
failure shape as the `isoDate` bug from Phase 2/3 (documented in
`patients.schemas.ts`) — an HTML input's "empty" representation doesn't
match what an optional Zod field will accept. Caught by a real Playwright
run (DB check afterward showed zero `PrescriptionItem` rows despite the UI
looking like the save had gone through) and fixed with `setValueAs` instead
of `valueAsNumber`, converting `''` to `undefined` before Zod ever sees it.

Verified: `tsc --noEmit`, `eslint .`, `vitest run` (34/34, was 27/27
before this phase) all clean; `next build` locally (all new routes
correctly `ƒ` dynamic); full Docker image rebuild; and a full Playwright
walkthrough against `next dev` — using a fixture script that writes a
CONFIRMED appointment directly (bootstrapping past the Razorpay-less
checkout, which is already covered by its own tests) — driving the entire
doctor flow (start → save details → clinical note → finalize note → draft
prescription → finalize prescription → complete) and then the patient's
read-only view, confirming the finalized note and prescription are visible
and correctly formatted. All fixture data was deleted afterward.

## Review-deployment login fix (out of band, reported by user)

The user reported "Incorrect OTP" trying to log into the live LAN
deployment with the documented dev code (`123456`). Root cause: the
Docker image runs `NODE_ENV=production` (required for Next's standalone
build), which correctly disables `OTP_DEV_CODE`/`EXPOSE_DEV_OTP`/
`DEV_ADMIN_MFA_CODE` per `docs/SECURITY-MODEL.md`'s "no dev bypass in
production" rule — but this repo's review deployment (docker-compose.yml,
LAN-exposed, no real SMS/MFA provider) also runs with that same
`NODE_ENV=production`, so it was just as locked out as a real deployment
would be, with no way to actually log in.

Fixed by decoupling "Next.js production build" from "genuinely locked-down
deployment": a new `ALLOW_DEV_AUTH_BYPASS_IN_PROD` env var (default
`false` everywhere) must be explicitly set on top of `NODE_ENV=production`
before the three dev codes fire (`isLockedDownDeployment()` in
`src/lib/env.ts`, used by `auth.service.ts` and the notification mock
adapter). Set to `true` only in this review deployment's `.env` — never in
a real deployment's. `.env.example` documents this explicitly, including
that `docker-compose.prod.yml` (Phase 12) must not set it.

Also found and fixed a second, related bug the OTP issue was masking: the
session cookie's `secure` flag was tied to `NODE_ENV` too, so even after
fixing OTP, a login would have appeared to succeed but the browser would
silently drop the `Secure` cookie over this deployment's plain HTTP,
breaking the session. Changed `sessionCookieOptions()` to derive `secure`
from whether `APP_BASE_URL` is an `https://` origin instead — the actually
correct signal, unrelated to build mode. Verified end-to-end with a raw
curl request/verify/me sequence against the rebuilt container: `devOtp`
now returned, cookie set without `Secure`, and the follow-up authenticated
request succeeds.

## Phase 6 — Care Plan Engine

Net-new per `docs/DOMAIN-MODEL.md` §6 (one migration,
`phase6_care_plan_engine`): `CarePlan`, `CarePlanItem`, plus
`DoctorAvailability`-style enums for status/type/related-entity.

- **State machine, actually enforced**: `DRAFT → ACTIVE → {PAUSED ⇄ ACTIVE,
  COMPLETED, CANCELLED}`, plus `ACTIVE → SUPERSEDED`; terminal states have
  no way out. The domain doc lists the six statuses but not a transition
  diagram, so `ALLOWED_TRANSITIONS` in `care-plans.service.ts` is the
  actual state machine — covered by an integration test that confirms
  `DRAFT` can't jump straight to `COMPLETED` and a `COMPLETED` plan can't
  reopen.
- **Clinical content vs. patient fulfilment stay genuinely separate**
  (the brief's explicit rule): `CarePlanItem.status` can only be written
  by the owning doctor (`updateCarePlanItem`); a patient's "I did this" can
  only ever touch a distinct `patientMarkedDoneAt` timestamp
  (`acknowledgeCarePlanItem`), which never appears in any clinician-facing
  write path. An integration test marks an item done as the patient, then
  clinically completes the same item as the doctor, and asserts neither
  write touched the other's field.
- **A plan requires a genuine doctor-patient relationship**: `createCarePlan`
  either validates the given `consultationId` belongs to both parties, or
  (when a plan originates outside a single consultation, which the domain
  model explicitly allows) requires that a consultation between this
  doctor and patient exists at all — a doctor can't spin up a plan for a
  stranger. Verified by a test that asserts a `ForbiddenError` for a
  patient with no consultation history.
- **DRAFT plans are the doctor's own workspace**, same pattern as an
  unfinalized `ClinicalNote` — invisible to `getCarePlan` for a patient
  caller until the doctor activates it.
- **UI**: entry point is a "+ New care plan" form directly on the doctor's
  consultation workspace (prefilled with that consultation's patient),
  since that's where the doctor-patient relationship is actually
  established; `/doctor/care-plans` and `/patient/care-plans` list pages
  exist separately because — unlike Consultations in Phase 5 — a plan
  isn't 1:1 with anything already navigable (it can span many visits, and
  a doctor accumulates plans across many patients).
- Integration tests (`tests/integration/care-plans.test.ts`, 7 cases):
  relationship requirement, status machine (valid + invalid transitions +
  cross-doctor ownership refusal), DRAFT visibility, and the clinical/
  fulfilment separation both ways.

### A real, pre-existing concurrency bug found while widening the test suite

Adding a third test file that reuses the same fixed doctor name ("Asha
Rao", already used by `appointments.test.ts` and now `consultations.test.ts`)
made a latent race in `doctors.service.ts`'s `uniqueSlug()` fail reliably
instead of by chance: it's a classic check-then-act (`findUnique` then
`update`) — two profiles saving the same name at nearly the same moment
can both see the candidate slug as free and both try to claim it. This is
a real production bug, not just test flakiness (two doctors named "Priya
Sharma" registering around the same time would hit it for real), so it's
fixed in the actual service, not papered over in the tests:
`updateMe` now retries with a fresh random-suffixed candidate
(`uniqueSlugCandidate`) on a slug conflict specifically, up to 5 attempts,
instead of surfacing a confusing "already associated" error to whoever
loses the race.

Finding the fix took an extra step: the first attempt at detecting "was
this P2002 a slug conflict specifically" (checking `error.meta.target`)
never matched, because this project's Prisma 7 driver-adapter setup
(`@prisma/adapter-pg`, docs/DECISIONS.md D7) reports a completely
different `meta` shape for unique-constraint errors than the classic query
engine does — `meta.driverAdapterError.cause.constraint.index` (the
Postgres constraint name) instead of `meta.target` (a column-name array).
`isUniqueConstraintOn()` now checks both shapes. Confirmed fixed by
running the full suite 8 times back-to-back with zero failures (it had
been failing roughly half the time before).

Verified: `tsc --noEmit`, `eslint .`, `vitest run` (41/41, stable across 8
consecutive runs) all clean; `next build` locally (all new routes
correctly `ƒ` dynamic); full Docker image rebuild; and a full Playwright
walkthrough against `next dev` using the same bootstrapped-CONFIRMED-
appointment fixture pattern as Phase 5 — doctor creates a plan from a
consultation, adds an item, activates it (shares with patient); patient
sees it and marks the item done; doctor sees the patient's acknowledgement
without it touching the item's clinical status. All fixture data deleted
afterward.

## Next up

## Phase 7 — Diagnostics, Reports, Lab portal

Net-new per `docs/DOMAIN-MODEL.md` §7-8 (one migration,
`phase7_diagnostics_and_reports`): `DiagnosticLab`, `DiagnosticTest`,
`DiagnosticRecommendation`, `DiagnosticOrder`, `DiagnosticOrderItem`,
`SampleCollection`, `DiagnosticReport`, and `Report` (the generic document
library, §8 — deliberately a separate concept from diagnostic booking per
the blueprint's explicit rule). First phase to add a new portal + role:
**LAB**.

**Scope decisions, made explicit rather than silently assumed:**
- One `DiagnosticLab` per LAB-role `User` — the same 1:1 shape as
  `DoctorProfile`. A real multi-staff-per-lab-org model would need its own
  permissions layer; `StaffProfile.organizationId` is already reserved for
  that per its Phase 0 comment, but building it out is out of scope here.
- Lab verification mirrors the doctor flow's state machine but is lighter:
  no per-document upload/review subsystem — a lab's license numbers are
  identifiers an admin can verify externally, not scans needing individual
  review.
- No `DiagnosticPackage` yet — every order line item is a single test.
  `testId`/`packageId` were already both nullable on recommendations and
  order items in the original domain model specifically so this can land
  without a schema change later.
- Booking has no slot-locking (unlike appointments) — a lab isn't a single
  practitioner with finite calendar capacity, so there's nothing to race
  over; `scheduledAt` is just a plain patient-chosen time.
- LAB self-onboarding required extending the same gate doctors use
  (`ALLOW_DOCTOR_SELF_ONBOARDING` → generalized alongside a new
  `ALLOW_LAB_SELF_ONBOARDING`) — and turned up a second copy of the same
  role-check in `verifyOtp` that would have silently blocked LAB signups
  even after the first fix; both are now consistent.

**Recommendation → booking → fulfilment, exactly as designed:**
`DiagnosticRecommendation` (doctor's clinical intent, `testId` optional)
is distinct from `DiagnosticOrder` (the patient's actual paid booking) —
a patient can also self-initiate a booking with no recommendation at all,
per the blueprint's explicit allowance. Booking reuses the Razorpay
adapter and Payment model from Phase 4 wholesale (`purpose:
DIAGNOSTIC_ORDER`, already anticipated in the Phase 4 enum) — the shared
webhook route now inspects `Payment.purpose` and dispatches to the right
module's finalizer instead of assuming every payment is a consultation.

### Two real bugs found via testing, not inspection

1. **`DiagnosticOrder.recommendationId` was almost `@unique`** — caught
   before it shipped, not after, by directly applying the lesson from
   Phase 4's `Appointment.slotId` bug (documented above): a cancelled
   order must not permanently block rebooking the same recommendation, so
   it's a plain indexed FK with "at most one active order per
   recommendation" enforced in the service layer instead.
2. **A real integration test failure, not a test bug**: booking a second
   order against an already-`BOOKED` recommendation raised "Recommendation
   not found" instead of "already has an active order" — because the
   existence lookup itself filtered on `status: 'RECOMMENDED'`, so a
   `BOOKED` recommendation (which very much exists) looked identical to a
   nonexistent one. Fixed by separating "does this recommendation exist"
   from "is it in a bookable state" into two checks with distinct error
   messages.
3. **A real UI bug found only by driving the actual lab fulfilment flow in
   a browser**: after releasing a diagnostic report, the lab's order page
   kept showing the release form indefinitely instead of the "report
   released" confirmation. Root cause: `OrderActions` held `status` and
   `report` in local `useState`, and two of its three action handlers
   called `router.refresh()` afterward expecting that to somehow flow new
   values back into that local state — but a re-rendered Server Component
   parent does not reset an already-mounted Client Component's `useState`
   from new props. Fixed by dropping `router.refresh()` entirely from
   this component and having every action set its local state directly
   from its own response, consistent with how the other two handlers
   (sample-collected, processing) already worked correctly.

Verified: `tsc --noEmit`, `eslint .`, `vitest run` (51/51, stable across 3
consecutive runs — was 41/41 before this phase) all clean; `next build`
locally (all ~30 new routes correctly `ƒ` dynamic); full Docker image
rebuild; and a full Playwright walkthrough against `next dev` covering
every role in sequence — lab self-registration → profile → catalogue →
submission, admin approval, doctor recommendation from a live
consultation, the patient seeing that recommendation and hitting the
honest "payments not configured" message on the public catalogue's
booking widget, and (via the same bootstrapped-paid-order fixture pattern
used in Phases 5/6, since there's still no real Razorpay account here) the
full lab fulfilment sequence — collect → process → release a critical
report — through to the patient seeing it in both Diagnostics and
Reports. All fixture data deleted afterward.

## Phase 8 — Medicines + pharmacy portal

Net-new per `docs/DOMAIN-MODEL.md` §9 (one migration,
`phase8_medicines_and_pharmacy`): `Medicine`, `Pharmacy`,
`PharmacyInventory`, `MedicineOrder`, `MedicineOrderItem`, `Shipment`, plus
a retrofitted FK from Phase 5's `PrescriptionItem.medicineId` (previously
an unused, unconstrained column) onto the new `Medicine` table. Third
phase to add a new portal + role: **PHARMACY**.

**The one modelling decision that shaped everything else:** unlike
`DiagnosticTest` (Phase 7, deliberately scoped one-per-lab, since a test is
a lab-specific procedure), `Medicine` here is a **platform-wide** catalogue,
not owned by any one pharmacy. This isn't an arbitrary difference — a
doctor writing a `PrescriptionItem` has no idea which pharmacy will
eventually fill it, so `medicineId` has to point at a stable drug identity
independent of any pharmacy. Each pharmacy then holds its own
`PharmacyInventory` (batch number, expiry, quantity, price) against that
shared `Medicine` row. The catalogue is built lazily, never curated
up front: `resolveMedicineByName` (find-by-name-or-create,
case-insensitive) is called from two places — `finalizePrescription`
(Phase 5 code, now resolves each item's free-text `productName` to a
catalogue entry the moment a prescription is finalized, never at draft
time) and a pharmacy's own "add inventory" flow (stocking an OTC item
nobody has prescribed yet). A later, more complete mention of the same
drug name fills in gaps (form, strength, manufacturer) on the existing row
rather than creating a duplicate or clobbering what's there.

**Scope decisions, made explicit rather than silently assumed:**
- No `Brand`/`Manufacturer` join tables and no
  `MedicineOrderItemSubstitution` audit trail this phase — brand/
  manufacturer are plain descriptive strings on `Medicine`, and a
  pharmacist simply isn't offered a substitution action. Same "document
  the gap in a schema comment, don't build an unused stub table" call as
  Phase 7's `DiagnosticPackage`.
- `MedicineOrderStatus` is the brief's exact 6-value list (`PENDING |
  ACCEPTED | PACKING | DISPATCHED | DELIVERED | CANCELLED`) — unlike
  `AppointmentStatus`/`DiagnosticOrderStatus`, there's no separate
  "awaiting payment" state. `PENDING` does double duty: an order sits at
  `PENDING` both before and after payment succeeds. `Payment.status` is
  what actually distinguishes the two — `acceptOrder` refuses a pharmacy
  action until `payment.status === 'SUCCESS'`, and `listMineAsPharmacy`
  filters on payment status rather than order status for the same reason
  Phase 7's lab order list excludes `BOOKED`.
- Stock is reserved FEFO (first-expiry-first-out: the soonest-expiring
  batch with enough quantity to cover the whole line) at booking time, in
  the same transaction as order creation — mirroring how Phase 7 reserves
  a `DiagnosticRecommendation`. Splitting one order line across multiple
  batches is out of scope; insufficient stock in any single batch fails
  the booking outright rather than silently partial-filling it. Cancelling
  a `PENDING`/`ACCEPTED` order restocks the reserved quantity.
- PHARMACY self-onboarding is the third role behind the same gate pattern
  as DOCTOR and LAB (`ALLOW_PHARMACY_SELF_ONBOARDING`, checked in both
  `requestOtp` and `verifyOtp` this time — Phase 7 already found and fixed
  the "two independent copies of the same check" trap, so this one landed
  correct on the first pass).

**Ordering, exactly as designed:** a patient orders either against a
finalized `Prescription` (only the items whose resolved `Medicine` this
specific pharmacy actually stocks are orderable —
`matchPrescriptionAtPharmacy` shows availability per item before the
patient commits) or, for OTC (`requiresPrescription: false`) items,
directly from the public `/medicines` catalogue with no prescription at
all. Booking reuses the Razorpay adapter and `Payment` model wholesale
(`purpose: MEDICINE_ORDER`, already anticipated in the Phase 4 enum) — the
shared webhook route now dispatches to a third module's finalizer
alongside `CONSULTATION` and `DIAGNOSTIC_ORDER`.

Verified: `tsc --noEmit`, `eslint .`, `vitest run` (63/63, stable across 3
consecutive runs — was 51/51 before this phase, +12 new tests) all clean;
`next build` locally (all ~25 new routes correctly `ƒ` dynamic); full
Docker image rebuild and redeploy; and a full Playwright walkthrough
against the live container covering: pharmacy self-registration → profile
→ inventory (OTC batch) → submission, admin approval, the new OTC item
appearing on the public `/medicines` catalogue, a patient hitting the
honest "payments are not configured" message when attempting to order it,
a patient seeing a finalized prescription on `/patient/medicines` and
`matchPrescriptionAtPharmacy` correctly reporting stock availability at a
chosen pharmacy, and (via the same bootstrapped-paid-order fixture pattern
used in Phases 5-7) the full pharmacy fulfilment sequence — accept → pack
→ dispatch (with carrier/tracking) → deliver — with the patient seeing the
order reach `DELIVERED` with tracking info on their own dashboard
afterward. All fixture/test data deleted afterward, including 54 orphaned
`Medicine` rows accumulated across repeated `vitest run` stability checks
(expected: `Medicine` has no owning FK, so nothing cascade-deletes it the
way `DiagnosticTest` gets cleaned up via its owning lab).

## Phase 9 — Panchakarma + centre portal

Net-new per `docs/DOMAIN-MODEL.md` §10 (one migration,
`phase9_panchakarma`): `PanchakarmaCentre`, `Therapy`, `Therapist`,
`PanchakarmaRecommendation`, `PanchakarmaBooking`, `PanchakarmaSession`.
Fourth and last partner-facing role/portal: **PANCHAKARMA_CENTRE**.

**Modelling choice, following the Phase 7 precedent rather than Phase 8's:**
`Therapy` and `Therapist` are **centre-owned**, not a platform-wide
catalogue — the same shape as `DiagnosticTest` (lab-owned), not `Medicine`
(platform-wide). The reasoning is identical to Phase 7's: a therapy is a
specific centre's offering (its own price, its own duration, its own
supervision requirement), not an interchangeable drug identity a
prescription can point at independent of who fills it. A doctor's
`PanchakarmaRecommendation` therefore names a specific `Therapy` at a
specific centre, not an abstract treatment type.

**Scope decisions, made explicit rather than silently assumed:**
- No `TherapyPackage` table — the brief's "course of N sessions" concept
  is carried entirely by `sessionCount` on the booking (and
  `sessionCountRecommended` on the recommendation), same "document the gap,
  don't build an unused stub table" call as Phase 7's `DiagnosticPackage`
  and Phase 8's `Brand`/`Manufacturer`.
- `PanchakarmaBookingStatus` has no separate "awaiting payment" state, so
  `BOOKED` does double duty before and after payment succeeds —
  `Payment.status` is what actually distinguishes the two, same pattern as
  Phase 8's `MedicineOrderStatus.PENDING`.
- `PanchakarmaBooking.recommendationId` is nullable and deliberately
  **not** `@unique` — a patient can self-book a therapy directly from the
  public catalogue with no doctor recommendation at all (mirroring Phase
  8's medicines: prescription-linked *or* OTC), and a cancelled-and-rebooked
  recommendation can point at a second booking without a stale unique
  constraint in the way. Same non-unique-FK rule applied proactively since
  the Phase 4 `Appointment.slotId` bug, reused identically in Phase 7's
  `DiagnosticOrder.recommendationId`.
- PANCHAKARMA_CENTRE self-onboarding is the fourth role behind the same
  `ALLOW_<ROLE>_SELF_ONBOARDING` gate, checked in both `requestOtp` and
  `verifyOtp`.

**Fulfilment, exactly as designed:** a centre schedules each
`PanchakarmaSession` individually (`scheduledAt`, optional `therapistId`)
and marks it attended one at a time; the booking status derives from
session progress (`BOOKED` → `IN_PROGRESS` after the first attended session
→ `COMPLETED` once `sessionCount` sessions are attended). The centre
portal's booking-detail page was built as a client component holding its
own `status`/`sessions` state from the start — updated directly from each
action's response rather than from a server re-render — applying the
Phase 7 stale-client-state lesson proactively instead of discovering it
live again.

Verified: `tsc --noEmit`, `eslint .`, `vitest run` (74/74, stable across 3
consecutive runs — was 63/63 before this phase, +11 new tests) all clean;
`next build` locally (all ~13 new routes correctly `ƒ` dynamic); full
Docker image rebuild and redeploy; and a full Playwright walkthrough
against the live container covering: centre self-registration →
profile → therapy → therapist → submission, admin approval, the new
therapy appearing on the public `/panchakarma` catalogue, a patient
hitting the honest "payments are not configured" message when attempting
to book it, and (via the same bootstrapped-paid-booking fixture pattern
used in Phases 5-8) the full centre fulfilment sequence for a
doctor-recommended two-session course — schedule → mark attended →
schedule → mark attended — with the booking reaching `COMPLETED` and the
patient seeing "2/2 sessions attended" on their own dashboard afterward.
All fixture/test data deleted afterward (centre, its therapies/therapists/
bookings/sessions all cascaded from one `User` delete; the fixture
doctor, recommendation, and orphaned fixture payments cleaned up
explicitly) — verified back to zero rows across every Phase 9 table.

## Phase 10 — Support / Tech Support / Sales / Care Coordination CRM

Net-new per `docs/DOMAIN-MODEL.md` §12 (one migration,
`phase10_support_crm`): `SupportTicket`, `SupportMessage`,
`SupportAttachment`, `PartnerLead`. Fourth and last set of new
portals/roles in the brief's 10-portal count — **CUSTOMER_SUPPORT**,
**TECH_SUPPORT**, **SALES**, **CARE_COORDINATOR** — but unlike the
partner roles (LAB/PHARMACY/PANCHAKARMA_CENTRE/DOCTOR), none of these
self-onboard: `modules/staff` gives an admin a real "create staff
account" UI (`/admin/staff`) that provisions a `User` + `StaffProfile`
(the latter already scaffolded, unused, since Phase 0) directly, the same
way `prisma/seed.ts` has always provisioned the demo admin — just through
a UI instead of a script.

**One ticket model, four queues:** rather than a separate table per
department, `SupportTicket.department` reuses the existing
`StaffDepartment` enum (Phase 0) and every one of the four portals reads/
writes the same table filtered to its own department —
`modules/support/tickets.service.ts`'s `departmentForRole()` is the single
place that mapping lives. Sales is the exception with extra surface: it
also owns the `PartnerLead` pipeline, tracked independently of tickets.

**Classification and SLA targets are the brief's own tables, not
invented ones** (blueprint §27/§28, extracted from the source `.docx`
since `docs/DOMAIN-MODEL.md` referenced the SLA table by name but didn't
inline it): `SupportTicketCategory` is the patient support journey's
8-value list (`BOOKING | PAYMENT | REPORT | MEDICINE | THERAPY |
CLINICAL_CONCERN | TECHNICAL_ISSUE | GENERAL`); each category defaults to
a `SupportTicketPriority` (P1-P4) and a department per
`modules/support/sla.ts`, with `CLINICAL_CONCERN` forced to P1 and routed
to Care Coordination regardless of who files it — the same "never let a
safety concern sit at low priority" promise the Phase 0 placeholder page
already made to patients, now backed by real routing. `sla` is stored as
a JSON snapshot (numeric response deadline; the brief's P2-P4 resolution
targets are qualitative text — "same business day," "1-2 business days" —
so they're kept as descriptive text, not a fabricated second deadline).

**Scope decisions, made explicit rather than silently assumed:**
- No automatic classification, routing engine, or SLA-breach
  alerting/paging this phase — category → priority/department is a static
  default table an agent can override (`triage` action), and nothing
  watches `sla.responseDueAt` and fires a notification when it passes.
  Same "document the gap" call as every prior phase's deferred piece;
  breach alerting belongs with Phase 12's observability wiring.
- `SupportTicket`'s four `linked*` fields (appointment/medicine-order/
  diagnostic-order/panchakarma-booking) are plain, unenforced string
  columns rather than Prisma relations — deliberately mirroring
  `Payment.purposeEntityId`'s existing polymorphic-reference convention
  (Phase 4), since a ticket may reference any one of four unrelated order
  types and a real FK would mean a support-only back-relation array on
  every one of those models.
- `PartnerLead.stage` (Lead → Qualified → Verification → Commercial →
  Enablement → Activated/Rejected, the brief's own sales journey) is a
  CRM tracking field only, not a system gate — the actual credential/
  verification enforcement for each partner kind already lives in its own
  module (`DoctorVerificationStatus`, `PanchakarmaCentreVerificationStatus`,
  etc.); a rep marking a lead "Activated" doesn't make anything
  discoverable or bookable by itself.
- Care Coordinator's "unified patient work queue" (brief's own
  description of the role) reuses `CarePlanItem` with zero new schema —
  `listAtRiskItems()` surfaces anything `MISSED`, or `PLANNED`/`ACTIVE`
  with a due date already passed or within 2 days. Deliberately read-only:
  coordinators help patients complete the plan and escalate via a ticket,
  they don't edit clinical items themselves (that stays the doctor's).

Verified: `tsc --noEmit`, `eslint .`, `vitest run` (90/90, stable across 3
consecutive runs — was 74/74 before this phase, +16 new tests) all clean;
`next build` locally (all new routes correctly `ƒ` dynamic, including
`/sales/[id]` and the static `/sales/tickets` sibling resolving without
conflict); full Docker image rebuild and redeploy; and a full Playwright
walkthrough against the live container covering: an admin provisioning
all four staff accounts, a patient opening a ticket (verifying the
category → P3/Customer-Support default), the agent claiming it, replying,
and resolving it, both remaining portals (Tech Support, Care Coordination
— including the care-plan follow-up queue) loading their own empty
queues, the patient seeing the resolution and reopening the ticket by
replying again (`RESOLVED` → `IN_PROGRESS`), and a sales rep creating a
partner lead and moving it through the pipeline. The walkthrough needed
splitting across two `playwright test` invocations with a real
shell-level sleep between them — Playwright's `fullyParallel` config
re-imports the spec per test even under `--workers=1`, so the patient's
two logins (opening the ticket, then replying to the resolution) landed
inside the same 30s OTP cooldown window when run as one process; a
JSON state file replaces the DEMO_BOOKING_ID-style env-var handoff used
in earlier phases since here the ticket id is generated mid-run, not
known up front. All fixture data cleaned up afterward, including
`PartnerLead` rows orphaned across repeated `vitest run`s (its
`ownerUserId` is `onDelete: SetNull`, not `Cascade` — a lead outlives the
rep who logged it, same orphaning shape as Phase 8's `Medicine` rows) —
verified back to zero across every Phase 10 table.

## Phase 11 — Admin operations, reporting, audit

Net-new per `docs/DOMAIN-MODEL.md` §11 (one migration,
`phase11_admin_ops`): `Refund` — the one Payments entity left unbuilt
after Phase 4. Everything else this phase adds is UI/reporting over data
every earlier phase already writes; no other new tables.

**Refunds are staff-mediated, not self-service.** A patient never sees a
"request refund" button on their own booking/order pages — instead, the
brief's own patient support journey (blueprint §28: "refund query" is a
named P3 ticket example) is taken literally: a `CUSTOMER_SUPPORT` agent
(or `ADMIN`) requests a refund *from inside a support ticket*, against
one of that ticket's linked patient's actual payments.
`getTicket()` (`modules/support/tickets.service.ts`) now returns the
linked patient's refundable payments alongside the thread whenever the
viewer is staff, and `TicketThread` renders a "Patient's payments" card
with an inline amount field and a "Request refund" button — no separate
payments-search screen needed, since every payment a patient has made is
already reachable from a ticket about it. Approval is where
`docs/SECURITY-MODEL.md`'s MFA gate actually bites: only `ADMIN` (via
`requireAdminMfa`) can approve or reject, from a new `/admin/refunds`
queue.

**The refund gateway call is synchronous, unlike checkout — deliberately
no webhook path added for it.** Booking/ordering needs a webhook backup
because the *client* could vanish mid-checkout before confirming; a
refund is entirely server-initiated by an admin, so the Razorpay SDK's
own response to `payments.refund()` (new `refundPayment()` in
`lib/payments/razorpay.ts`) is the confirmation. Same honest-gap pattern
as every checkout path when credentials are missing: `approveRefund`
always records the admin's decision (`status: PROCESSING`,
`approvedByUserId` set) so the audit trail is accurate regardless of
gateway availability, then only flips to `COMPLETED` (and the payment to
`REFUNDED`/`PARTIALLY_REFUNDED`, computed from what's still outstanding
across every non-rejected refund on that payment) if a real gateway call
actually succeeds — it never fabricates a completed refund.

**The audit log had been write-only since Phase 1.** Every phase since
has called `recordAuditEvent()`, and nothing had ever read `AuditEvent`
back — `docs/SECURITY-MODEL.md`'s "audit log access" privileged action
existed only as a design intent. `modules/audit/audit.service.ts` is the
first reader (`src/server/audit.ts`'s writer is untouched), and
`/admin/audit` filters by event type (populated from what's actually in
the table, not a hardcoded list that would drift the moment a new module
invents its own `eventType` string — eleven phases have each invented
their own), resource type, actor, and date range, paginated.

**The operations dashboard replaces `/admin`'s old redirect** — its own
Phase 0 comment ("Doctor verification is the only admin section that
exists so far... Phase 11 adds broader admin operations") anticipated
exactly this. `getDashboardMetrics()` runs a handful of `groupBy`/`count`
queries — verification-queue depth per partner type, order/booking counts
by status per module, payment/refund counts, lifetime revenue, open
ticket counts per support department, lead counts per sales stage — no
new metrics table, no cron/rollup job.

**Scope decisions, made explicit rather than silently assumed:**
- `Fee`/`Commission`/`Payout`/`Settlement`/`Reconciliation` from the raw
  blueprint's wider "Admin operations & settlements" vision are **not**
  modelled — `docs/DOMAIN-MODEL.md` §11 scopes this MVP's Payments section
  to `Payment`+`Refund` only, so partner payout/settlement tracking stays
  out of scope here, same "don't build an unused stub table" call as
  every earlier phase's deferred piece. "Reconcile bookings, orders and
  partner payouts" becomes, honestly, a revenue/volume dashboard over
  existing data — not a ledger.
- No automatic exception detection (stuck orders, aging tickets, anomaly
  alerts) — the brief mentions "operational exceptions" but specifies no
  concrete rules, so nothing is fabricated; the dashboard shows real
  counts an admin reads themselves.
- `Refund.requestedByUserId` isn't in the brief's literal field list but
  is added deliberately (staff-mediated refunds need to know who on
  staff filed the request); `approvedByUserId` doubles as "who rejected
  it" on a `REJECTED` refund — same one-field, two-meaning overload as
  `MedicineOrderStatus.PENDING` (Phase 8) and
  `PanchakarmaBookingStatus.BOOKED` (Phase 9).

Verified: `tsc --noEmit`, `eslint .`, `vitest run` (100/100, stable across
3 consecutive runs — was 90/90 before this phase, +10 new tests) all
clean; `next build` locally (`/admin`, `/admin/audit`, `/admin/refunds`
and their API routes all correctly `ƒ` dynamic); full Docker image
rebuild and redeploy; and a full Playwright walkthrough against the live
container covering: an admin landing on the real operations dashboard
(no longer redirected to doctor verification) after login, provisioning
a support agent, a patient opening a payments-category ticket, the agent
claiming it and seeing the patient's actual payment listed with a
"Request refund" control, requesting a ₹300 partial refund against a
₹500 payment, and an admin approving it from the `/admin/refunds` queue
(landing at `PROCESSING` — this environment still has no real Razorpay
credentials, so the honest "awaiting gateway confirmation" message shows
rather than a fabricated completion) and confirming both the REQUESTED
and APPROVED events in `/admin/audit`. All fixture data (staff accounts,
the support ticket, the seeded payment, and the refund it cascaded away
with) cleaned up afterward — verified back to zero across every Phase 11
table.

## Next up

Phase 12: Security hardening, performance, observability, backup,
deployment (`docs/IMPLEMENTATION-PLAN.md` row 12) — the final phase, not
yet started, pending explicit go-ahead. Outstanding, still unresolved:
real Ubuntu ESXi VM SSH details for the actual deployment target, and
real (even test-mode) Razorpay/SMS/email/WhatsApp/video credentials so
every payment-dependent flow built across Phases 4-11 can be exercised
fully live rather than stopping at honest "not configured" messages —
Phase 12's own scope (the 9 mandatory end-to-end tests run against a
deployed environment) makes at least the payment gateway credential a
likely hard blocker, not just a nice-to-have, for finishing it for real.
