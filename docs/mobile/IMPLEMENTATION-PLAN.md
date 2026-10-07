# ABIES Mobile — Implementation Plan

Phases match the brief's own phasing (its §26). Each phase lists what ships, which existing backend
routes it consumes (no new backend work unless stated), and its exit criteria — a phase is not done
because it compiles; it's done when every row in its exit-criteria table is true, per the brief's own
quality gates (§27).

A phase is implemented, tested, documented, and committed before the next one starts (brief §25). Phases
within one feature area (e.g. 4-7, which are all "pick something, pay for it") share the same cart/order/
payment plumbing built in Phase 1, so they move faster than the phase numbers alone suggest — but each
still gets its own exit check before merging.

## Phase 0 — Discovery and architecture (this set of documents)

Deliverables: this doc, CURRENT-BACKEND-API.md, API-GAP-ANALYSIS.md, MOBILE-ARCHITECTURE.md,
SECURITY-DESIGN.md, TEST-STRATEGY.md. **Exit**: presented for review (per the brief's own §30
instruction) before any Flutter code is written.

## Phase 1 — Project foundation

Flutter project at `apps/mobile/`; `core/` (api client with the Option A cookie-jar approach, env/flavor
config, router skeleton, theme tokens, secure storage wrapper); empty shells for each feature folder;
CI job that runs `flutter analyze` + `flutter test` on every PR (no build/sign yet — that's Phase 11).

No backend calls with real data yet beyond `GET /api/v1/health` as an API-client smoke test.

Exit: analyzer clean, unit tests for the api client's error-mapping and the cookie-jar persistence pass,
CI green, `docs/mobile/IMPLEMENTATION-PLAN.md` phase checklist updated.

## Phase 2 — Authentication and patient profile

Consumes: `POST /api/v1/auth/otp/request`, `POST /api/v1/auth/otp/verify`, `GET /api/v1/auth/me`,
`POST /api/v1/auth/logout`, `GET/PATCH /api/v1/patients/me`, `GET/POST /api/v1/patients/me/family`,
`GET /api/v1/consent/me`, `POST /api/v1/consent/[artifactId]/accept`.

**Decision made** (API-GAP-ANALYSIS.md 3, 2026-10-07): prioritize WhatsApp OTP delivery. The backend side
of this already landed — `requestOtp()` attempts a WhatsApp send for every mobile-identifier request,
additive to the existing email send, gated behind `WHATSAPP_ENABLED` and the MSG91 template map exactly
like any other WhatsApp message. Phase 2's mobile sign-up screen can be built against this now; it will
start actually delivering by WhatsApp the moment a person flips the switch after template approval, with
no further mobile-side change. Until then, mobile sign-up for an account with no email on file has no
live delivery path in dev/prod (only the dev-mode OTP bypass) — build and test the UI now, but don't
call Phase 2 fully done for that case until WhatsApp is switched on.

Exit: registration, login, logout, session persistence across app restart, profile edit, family-member
CRUD, consent accept/withdraw all exercised by integration tests against a real dev-environment backend
(not mocks) at least once, in addition to unit/widget tests against mocks.

## Phase 3 — Home dashboard — **implemented and verified**, 2026-10-07

Consumes: `GET /api/v1/public/doctors`, `/public/panchakarma`, `/public/diagnostics`, `/public/medicines`
(all already support facets/filters), `GET /api/v1/appointments/mine`, `GET /api/v1/medicine-orders/mine`,
`GET /api/v1/diagnostic-orders/mine`, `GET /api/v1/panchakarma-bookings/mine`.

**Location scope decision, made explicitly for this phase** (supersedes this section's original
"device location after an explicit permission prompt" wording): this phase uses the signed-in patient's
own `PatientProfile.city` (Phase 2) as the location signal instead of device geolocation — passed as
`city` to the doctors/Panchakarma/diagnostics public routes and as `area` to the medicines route (its
filter field is actually named `area`, not `city` —
`packages/domain/src/modules/medicines/catalogue.schemas.ts`'s `publicMedicineSearchSchema`). No
geolocation/GPS package was added and no device location permission is requested. A patient with no city
set gets the same unfiltered content (the brief §5 fallback), reached by simply never asking the device
for a location — there was no permission-denial path to test because no permission is ever requested.
This is a deliberate, reported scope choice, not a backend gap: the public catalogue routes' own
location filters work as documented; the mobile client just sources the filter value from the profile
instead of the device for this phase.

Exit: home renders fully from live route/service-code-verified shapes (no hardcoded placeholder content
left in — see `apps/mobile/lib/features/home/`), graceful empty/error/loading states for each of the
eight sections independently (`HomeController`'s per-section `AsyncValue`s plus
`shared/widgets/state_views.dart`/`loading_skeleton.dart`), each section's own retry verified via unit
test. `flutter analyze` clean, `flutter test` green (35/35, the original 11 plus 24 new), a real debug
APK built (`flutter build apk --debug --dart-define=ABIES_ENV=dev -t lib/main_dev.dart`). Not yet
run on a device/emulator — same caveat as Phases 1-2 (`apps/mobile/README.md` "Status").

## Phase 4 — Doctor discovery and appointments — **implemented and verified**, 2026-10-07

Consumes: `GET /api/v1/public/doctors`, `/public/doctors/facets`, `/public/doctors/[slug]`,
`/public/doctors/[slug]/reviews`, `/public/doctors/[slug]/photo`, `GET /api/v1/appointments/slots`,
`POST /api/v1/appointments/hold`, `POST /api/v1/appointments/verify-payment`,
`POST /api/v1/appointments/[id]/cancel`, `POST /api/v1/appointments/[id]/review`,
`GET /api/v1/appointments/mine`.

Availability is never computed client-side — slot listing and hold are both server round-trips, every
time, including right before showing "book now" as enabled (brief §7's own rule):
`BookingController.confirmBooking` (`apps/mobile/lib/features/appointments/presentation/
booking_controller.dart`) re-fetches the slot list immediately before calling `/hold` and refuses to
hold a slot that fresh fetch no longer lists.

**What's actually done now**: the real search screen (full filter set, not just Phase 3's `city`+
`limit`), the real doctor detail screen (with a working not-found fallback for an unresolved slug —
API-GAP-ANALYSIS.md §7), slot selection, slot hold, the service-unavailable-for-payment state, cancel,
and review — all against the real dev backend's route/service code (read directly, not guessed), and
all unit-tested against fakes (`apps/mobile/test/unit/doctor_models_test.dart`,
`appointment_models_test.dart`, `doctors_controller_test.dart`, `booking_controller_test.dart`,
`appointments_controller_test.dart`).

**What's deferred to Phase 8, and why this isn't a Phase 4 gap**: `RAZORPAY_KEY_ID`/
`RAZORPAY_KEY_SECRET` are blank in this environment's `.env` (confirmed by reading
`packages/domain/src/lib/payments/razorpay.ts`'s `isConfigured()` and `appointments.service.ts`'s
`holdSlot()`, which throws a 503 `ServiceUnavailableError` before creating anything when they're blank),
so a full search→book→**pay**→confirm flow and a real double-booking race against a live gateway cannot
be exercised end to end in this environment regardless of mobile-side work — the real Razorpay Flutter
SDK integration, and testing the pay step for real, are Phase 8 (`docs/mobile/API-GAP-ANALYSIS.md` §5,
which also flags the missing idempotency key on these same POST routes as a Phase-8 prerequisite). This
phase implements the full `/hold` success-path plumbing (`AppointmentHold`, `/verify-payment`) and
tests it against a fake API, but never calls a real payment SDK. The *booking-conflict* race (two holds
racing for the same slot) is exercised today, without a real payment gateway, via
`BookingController`'s own handling of the backend's `409 ConflictError` and via the re-fetch-before-hold
check above — both unit-tested in `booking_controller_test.dart`.

Exit: search/detail/slot-selection/hold/cancel/review flows implemented and unit-tested against the
real route/service contracts; the service-unavailable payment state handled as a normal, displayable
outcome, not a crash; `flutter analyze` clean, `flutter test` green (72/72 — the original 35 through
Phase 3, plus 37 new), a real debug APK built. A full pay→confirm flow against a live gateway, and a
real double-booking race against that gateway, are explicitly carried into Phase 8 once real Razorpay
keys exist somewhere this app can be tested against end to end — not deferred by oversight.

## Phase 5 — Panchakarma — **implemented and verified**, 2026-10-07

Consumes: `GET /api/v1/public/panchakarma`, `/public/panchakarma/facets`, `/public/panchakarma-centres`,
`POST /api/v1/panchakarma-bookings`, `/verify-payment`, `POST /api/v1/panchakarma-bookings/[id]/cancel`,
`GET /api/v1/panchakarma-bookings/[id]`, `/panchakarma-bookings/mine`.

**What's actually done now**: the real search screen (`publicTherapySearchSchema`'s actual filter set —
`q`/`city`/`limit`/`offset`, confirmed by reading `catalogue.schemas.ts`; smaller than doctors', not
assumed equal to it), the real facets (`{cities}` only), a separate centre-centric browse screen for
`/public/panchakarma-centres` (confirmed, by reading both routes, to be a genuinely different path and
shape than `/public/panchakarma`), session-count-based booking (`bookTherapySchema` has no slot/time
concept — confirmed by reading `bookings.schemas.ts`), the service-unavailable-for-payment state, cancel,
and a booking list + detail screen (sessions, therapist names once assigned, payment) — all against the
real dev backend's route/service code (read directly, not guessed), and all unit-tested against fakes
(`apps/mobile/test/unit/panchakarma_models_test.dart`, `panchakarma_booking_flow_controller_test.dart`,
`panchakarma_bookings_controller_test.dart`).

**A real backend gap found and reported, not worked around**: there is no `GET /public/panchakarma/[id]`
and no `GET /public/panchakarma-centres/[id]` — confirmed by reading every file under
`apps/platform-api/src/app/api/v1/public/panchakarma*`; only the two list/search routes above exist,
unlike doctors' `/public/doctors/[slug]`. This means:
  - The therapy detail and booking screens cannot resolve a bare id the way `DoctorDetailScreen` does —
    they read the therapy from `GoRouter`'s navigation `extra` (the exact object the search screen
    already fetched from the real API) instead. A cold deep link to `/panchakarma/therapy/:id` with no
    `extra` behind it shows an honest "start from search" state rather than attempting a network call
    that doesn't exist — a real, permanent limitation of this phase's deep-linking versus Phase 4's,
    not a bug.
  - The centre list (`PanchakarmaCentresScreen`) is browse-only, with nothing to tap into. It would have
    been possible to *fake* a per-centre detail by re-filtering `/public/panchakarma`'s results down to
    one centre's id client-side, but that was deliberately not built — it would only look like a real
    per-centre contract while actually depending on an unrelated endpoint's `q`/`city` filters, and
    could silently drift or miss results. The honest fix is a backend `/public/panchakarma-centres/[id]`
    route, analogous to doctors' `/[slug]`, flagged here for backend follow-up, not built around.

**Booking re-fetch discipline, adapted from Phase 4's own rule** (brief §7): since there's no slot/time
step for Panchakarma and therefore nothing like `/appointments/slots` to re-fetch from,
`PanchakarmaBookingFlowController.confirmBooking` instead re-runs the real `/public/panchakarma` search
(scoped by the therapy's own name and centre city) immediately before calling `/panchakarma-bookings`,
and refuses to book if that fresh search no longer contains the exact centre+therapy pair — the
navigation `extra` object is never trusted as still accurate at the moment of booking, unit-tested in
`panchakarma_booking_flow_controller_test.dart`.

**What's deferred to Phase 8, and why this isn't a Phase 5 gap**: `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET`
are blank in this environment's `.env` (confirmed by reading `packages/domain/src/lib/payments/
razorpay.ts`'s `isConfigured()` and `bookings.service.ts`'s `bookTherapy()`, which checks it *first*,
before even looking up the centre/therapy, and throws a 503 `ServiceUnavailableError` before creating
anything when blank — the identical gate `holdSlot()` uses in Phase 4), so a full
search→book→**pay**→confirm flow cannot be exercised end to end in this environment regardless of
mobile-side work. This phase implements the full booking-creation success-path plumbing
(`PanchakarmaBookingCreationResult`, `/verify-payment`) and tests it against a fake API, but never calls
a real payment SDK — identical deferral to Phase 4.

Exit: search/detail/booking/cancel/history flows implemented and unit-tested against the real
route/service contracts; the service-unavailable payment state handled as a normal, displayable outcome,
not a crash; the missing single-therapy/single-centre detail routes found, reported, and designed
around honestly (navigation `extra`, not a fabricated endpoint); `flutter analyze` clean, `flutter test`
green (92/92 — the original 72 through Phase 4, plus 20 new), a real debug APK built. A full pay→confirm
flow against a live gateway is explicitly carried into Phase 8, same as Phase 4 — not deferred by
oversight.

## Phase 6 — Diagnostics

Consumes: `GET /api/v1/public/diagnostics`, `/packages`, `/facets`, `POST /api/v1/diagnostic-orders`,
`/verify-payment`, `GET /api/v1/diagnostic-orders/mine`, `/[id]/report-download`,
`POST /api/v1/diagnostic-orders/[id]/cancel`.

Report download reuses the same authorized-download pattern as prescriptions (SECURITY-DESIGN.md 8).

Exit: booking→payment→status→report-download flow tested; report download verified to fail for a
non-owning account (authorization test, not just a happy-path test).

## Phase 7 — Pharmacy and prescriptions

Consumes: `GET /api/v1/public/medicines`, `/facets`, `GET/POST /api/v1/patients/me/cart`,
`/cart/items/[id]`, `/cart/[id]/checkout`, `GET /api/v1/medicine-orders/mine`, `/[id]`,
`POST /api/v1/medicine-orders/verify-payment`, `/[id]/cancel`, `/[id]/review`,
`GET /api/v1/patients/me/prescriptions`.

Prescription-gated items follow whatever the backend's existing prescription-validation rule returns on
checkout — the mobile cart never has its own "is this a prescription medicine" logic that could drift
from the backend's (brief §10's own rule).

Exit: catalogue→cart→checkout→payment→order-history flow tested; a prescription-required item's
checkout-time enforcement verified to come from the backend response, not a client-side check that could
be bypassed by a modified client.

## Phase 8 — Payments

No new UI beyond what Phases 4-7 already built (payment is a step inside each of those flows, not a
separate screen tree) — this phase is the hardening pass: idempotency on retried submissions
(API-GAP-ANALYSIS.md 5 must land before this phase is called done), backend-verification-is-authoritative
tested explicitly (mobile never marks an order "paid" from a client-side payment-provider callback alone
— it waits for the backend's own verify-payment response).

Exit: a simulated flaky-network retry of a payment submission is verified not to create a duplicate
order/charge; a forced mismatch between provider callback and backend verification is verified to leave
the order in a non-paid state.

## Phase 9 — Push, WhatsApp/email triggers, deep links

Requires API-GAP-ANALYSIS.md 4 (device-token model + PUSH adapter) to exist first — this phase is
blocked on that backend work, not purely a mobile task. Also requires a Firebase project (credential/
account step — IMPLEMENTATION-PLAN.md 11) to exist before device registration can be tested for real.

WhatsApp/email are never called directly from mobile with provider credentials (brief §14) — mobile only
ever triggers them indirectly, by doing the same backend action (place an order, book an appointment)
that already causes `dispatch()` to send on whatever channels are configured.

Deep links resolve against the real public API before navigating (API-GAP-ANALYSIS.md 7), with a
website fallback for anything that doesn't resolve.

Exit: device token registers/deregisters correctly across install, token-refresh, and logout; a real
push is received end to end in the dev environment; a deep link to a resource that doesn't exist falls
back to the website, verified by test, not by inspection.

## Phase 10 — Security hardening, observability, performance

Runs the full SECURITY-DESIGN.md checklist against the app built in Phases 1-9 (not a parallel-track
item — it's a gate on everything already built). Observability abstraction wired to a real provider.
Performance pass: cold-start time, list-scroll jank, image loading on the catalogue screens.

Exit: SECURITY-REVIEW.md produced per the brief's §22 process, zero unresolved Critical/High findings.

## Phase 11 — Android/iOS release engineering

Requires, as credentials/accounts only the business can provide (not an engineering blocker, but a real
one — flag these early, don't wait until this phase to ask):

- A Google Play Console developer account and app listing.
- An Apple Developer Program account, App Store Connect app record, APNs key/certificate.
- A Firebase project (for Phase 9's push, reused here for release-side crash reporting if that's the
  chosen provider).
- Android keystore (generated once, backed up outside source control, never regenerated — losing it
  blocks all future updates to the same app listing).
- Confirmation of the real UAT/prod API hostnames (CURRENT-BACKEND-API.md 7 — these don't exist yet).

CI/CD: `flutter analyze` → tests → dependency/security scan → Android build (per flavor) → iOS build →
signing → artifact upload → manual release approval → store delivery. This pipeline is separate from the
Kubernetes GitOps flow — it does not touch ArgoCD, Tekton-for-backend, or any cluster resource (brief
§23's own rule); it can live as its own CI config (e.g. a dedicated Tekton pipeline using a Flutter/
Android/Xcode-capable runner, or a separate CI system if the cluster's build nodes can't run Xcode for
iOS — macOS build infrastructure is a real constraint to confirm, not assume).

Exit: a signed build installs from each store's internal testing track.

## Phase 12 — Production readiness review

`docs/mobile/PRODUCTION-READINESS.md`, `PLAY-STORE-RELEASE.md`, `APP-STORE-RELEASE.md` produced and
reviewed against every quality gate in brief §27, for every phase, not just the last one.
