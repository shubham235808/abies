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

## Phase 6 — Diagnostics — **implemented and verified**, 2026-10-07

Consumes: `GET /api/v1/public/diagnostics`, `/packages`, `/facets`,
`GET /api/v1/diagnostic-recommendations/mine`, `POST /api/v1/diagnostic-orders`, `/verify-payment`,
`POST /api/v1/diagnostic-orders/[id]/cancel`, `GET /api/v1/diagnostic-orders/[id]`,
`GET /api/v1/diagnostic-orders/mine`, `GET /api/v1/reports/mine`, `GET /api/v1/reports/[id]/download`.

**What's actually done now**: the real search screen — two tabs, tests (`GET /api/v1/public/
diagnostics`) and packages (`GET /api/v1/public/diagnostics/packages`), genuinely different endpoints/
shapes, not one list with a type filter — plus the real facets (`{cities}` only); test/package detail
screens with a working "start from search" fallback for a cold deep link (no detail-by-id route exists
— see below); a booking flow (collection mode → schedule → book → payment-or-unavailable) whose
`DiagnosticBookingTarget` type makes `testIds`/`packageId` mutual exclusion a compile-time property,
not just a runtime check, so package booking and multi-test booking are built as genuinely different
flows (the tests search tab has an explicit multi-select mode); a full "my diagnostic orders" list +
detail screen with cancel and report view/download; and a recommendations screen with "book from this
recommendation" — all against the real dev backend's route/service code (read directly, not guessed),
and all unit-tested against fakes (`apps/mobile/test/unit/diagnostic_models_test.dart`,
`diagnostic_booking_flow_controller_test.dart`, `diagnostic_orders_controller_test.dart`,
`diagnostic_recommendations_controller_test.dart`, `diagnostic_report_controller_test.dart`).

**The already-known detail-route gap, found again here, same shape as Phase 5**: no
`/public/diagnostics/[id]` and no `/public/diagnostics/packages/[id]` exist (confirmed by reading every
route under `apps/platform-api/src/app/api/v1/public/diagnostics*`). Resolved exactly like Panchakarma's
therapy detail: the test/package detail and booking screens carry their data via `GoRouter`'s
navigation `extra`, never re-fetched by id; opened cold they show an honest "start from search" state.

**Two further real gaps found by this phase, beyond the already-known one — found by reading the
brief's own named routes, not assumed from their descriptions**:

- `GET /api/v1/diagnostic-orders/[id]/report-download` — the route this phase's brief named for report
  download — is **doctor-only** (`requireRole(ctx, 'DOCTOR')`, calling `getReportDownloadUrlForDoctor()`,
  which requires the caller to be the doctor on the order's own recommendation). A patient gets a 403.
  The real patient-facing path, confirmed by also reading `docs/mobile/SECURITY-DESIGN.md §8` (which
  names it directly), is the generic patient document library: `GET /api/v1/reports/mine` +
  `GET /api/v1/reports/[id]/download` — a 5-minute signed URL returned as `{url}` JSON, **not** a
  302 redirect the way Phase 4's doctor photo route is (confirmed by reading `reports.service.ts`'s
  `downloadUrl()` and the route's own comment, not assumed from that precedent). Matching a diagnostic
  order to its generic report row takes an extra step, since `DiagnosticReport` (lab-side) and `Report`
  (patient-library) are separate tables with separate ids, linked only by
  `Report.sourceEntityType == 'DiagnosticOrder'` / `sourceEntityId == order.id` — confirmed by reading
  `orders.service.ts`'s `releaseReport()`. This app calls only the real route; it never calls
  `/diagnostic-orders/[id]/report-download` at all.
- `POST /api/v1/diagnostic-recommendations/[id]/cancel` — described in this phase's brief as something
  "the patient can act on (book from, or cancel)" — is **doctor-only** too: `requireRole(ctx, 'DOCTOR')`,
  and `cancelRecommendation()` itself checks doctor ownership with no patient branch at all. The
  recommendations screen therefore only offers "book from this recommendation"; it never builds a
  cancel action that would just 403 for a patient.

Both are documented as real gaps in `apps/mobile/lib/features/diagnostics/PHASE.md`, not worked
around or silently skipped.

**Report access respects SECURITY-DESIGN.md §8**: "View" (fetches a fresh signed URL, hands it to the
system browser/viewer via `url_launcher`, never an in-app WebView) and "Download" (fetches a fresh
signed URL, saves bytes to this app's own private sandbox directory via `path_provider`, never shared/
public storage) are two separate, explicit actions — neither automatic, neither sharing the file
anywhere without its own further explicit tap this phase doesn't build.

**Payment, read from the real code before building anything** (`bookOrder()` in `packages/domain/src/
modules/diagnostics/orders.service.ts`, `isConfigured()` in `packages/domain/src/lib/payments/
razorpay.ts`): `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are blank in this environment's `.env`, checked
*first* in `bookOrder()`, before the lab/test/package are even looked up — so every real booking
attempt here throws a 503 before any order/payment row is created. This phase's
`DiagnosticBookingFlowController` treats that as its own calm, expected `serviceUnavailable` state,
exactly mirroring Phase 4/5. The full success path and `/verify-payment` are implemented and
unit-tested against a fake API, but not reachable in this environment and have no real Razorpay
Flutter SDK call behind them — deferred to Phase 8, same as every prior phase.

Exit: search(tests+packages)→detail→booking(testIds-XOR-packageId enforced by type, collection-mode/
address validated client-side)→service-unavailable-for-payment→order-list/detail→cancel→report-
view/download, and recommendation→booking, all implemented and unit-tested against the real route/
service contracts; the service-unavailable payment state handled as a normal, displayable outcome, not
a crash; the missing single-item detail routes and the two doctor-only routes found, reported, and
designed around honestly (navigation `extra`, and never building a UI path that would just 403);
`flutter analyze` clean, `flutter test` green (132/132 — the original 92 through Phase 5, plus 40 new),
a real debug APK built. A full pay→confirm flow against a live gateway, and report-download
authorization against a live account boundary, are explicitly carried into Phase 8/10 — not deferred by
oversight (report-download's authorization is already enforced server-side by `requireRole`/the
patient-ownership check in `downloadUrl()`, confirmed by reading the real code; this phase did not
additionally stand up a second account in this environment to exercise that boundary end-to-end).

## Phase 7 — Pharmacy and prescriptions — **implemented and verified**, 2026-10-07

Consumes: `GET /api/v1/public/medicines`, `/facets`, `/public/medicines/[id]/reviews`,
`GET /api/v1/public/pharmacies`, `GET/POST /api/v1/patients/me/cart`, `PATCH`/`DELETE .../cart/
items/[id]`, `POST .../cart/[id]/checkout`, `GET /api/v1/medicine-orders/mine`, `/[id]`,
`POST /api/v1/medicine-orders`, `/verify-payment`, `/[id]/cancel`, `/[id]/review`,
`GET /api/v1/patients/me/prescriptions`, `GET /api/v1/prescriptions/[id]/match`.

**What's actually done now**: the real medicine catalogue search (`GET /api/v1/public/medicines`,
OTC-only, with `publicMedicineSearchSchema`'s full filter set) plus the real facets; medicine/pharmacy
detail screens with a working "start from the catalogue" fallback for a cold deep link (no detail-by-id
route exists — see below); a multi-cart-aware cart screen (one active cart per pharmacy — EXPANSION-1b)
with quantity edit/remove and a checkout flow per cart (address → checkout → payment-or-unavailable); a
full "my medicine orders" list + detail screen with cancel and per-item review; "my prescriptions" with
a detail screen via `extra`; and the real "purchase from a finalized prescription" flow (pick pharmacy →
match → pick quantities → order directly) — all against the real dev backend's route/service code (read
directly, not guessed), and all unit-tested against fakes (`apps/mobile/test/unit/pharmacy_models_test.
dart`, `prescription_models_test.dart`, `cart_controller_test.dart`, `checkout_flow_controller_test.
dart`, `medicine_orders_controller_test.dart`, `prescription_purchase_controller_test.dart` — 35 new
tests, 167 total, all passing).

**The already-known detail-route gap, found again here, same shape as Phase 5/6**: no
`GET /public/medicines/[id]` and no `GET /public/pharmacies/[id]` exist (confirmed by reading every
route under `apps/platform-api/src/app/api/v1/public/medicines*` and `.../public/pharmacies*`). Resolved
exactly like Panchakarma/Diagnostics: the medicine/pharmacy detail screens carry their data via
`GoRouter`'s navigation `extra`, never re-fetched by id; opened cold they show an honest "start from the
catalogue" state. There is also no single-cart `GET` (only the plural `/patients/me/cart`), so
`CheckoutScreen` takes its `Cart` via `extra` too, and `CheckoutFlowController` re-fetches every cart via
`myCarts()` to re-verify it immediately before checkout rather than trusting that `extra`.

**Three further real gaps found by this phase, beyond the already-known one — found by reading the
brief's own named routes/services, not assumed from their descriptions**:

- `GET /api/v1/prescriptions/[id]/route.ts` has **no `GET` handler at all** — only a doctor-only
  `PATCH` (`requireRole(ctx, 'DOCTOR')`, for `updatePrescription()`). Unlike Phase 6's doctor-only
  report-download route, there is no route being "worked around" here — there is simply no
  single-prescription read endpoint for anyone. Since `listFinalizedPrescriptionsForPatient()`'s own
  per-row shape already carries every item field this app needs, `PrescriptionDetailScreen` reads its
  object via `extra`, never a call that doesn't exist.
- A `Prescription` has **no storage-key/document field of any kind** in `packages/domain/prisma/
  schema.prisma` — confirmed by reading the full model. Unlike a `DiagnosticOrder`'s `DiagnosticReport`,
  there is nothing to view or download here; this app shows only the prescription's structured fields
  and does not build a document viewer for a file that doesn't exist.
- **The brief's own guessed purchase-from-prescription mechanism doesn't hold once the real code is
  read**: `addToCart()` refuses any `requiresPrescription` medicine outright with a 400 ("order it from
  a finalized prescription instead of the cart"), so a matched prescription item can never be "added to
  cart... one per matched item" as the brief's phrasing guessed. The real, working path is
  `POST /api/v1/medicine-orders` (`bookOrder()`) called directly — confirmed patient-reachable
  (`requireRole(ctx, 'PATIENT')`) — which is also the **only** path for a prescription-gated item, cart
  checkout being OTC-only. A smaller, inherited gap sits one level deeper:
  `matchPrescriptionAtPharmacy()` aggregates availability by `medicineId` only, with no variant
  granularity, so a prescribed medicine with real pack-size variants (EXPANSION-1) can show "available"
  from match while `bookOrder()`'s own variant-aware FEFO lookup still fails to find a non-variant batch
  — a backend-side limitation this phase's mobile code surfaces rather than works around (out of scope
  to fix here). See `lib/features/pharmacy/PHASE.md` and `lib/features/prescriptions/PHASE.md` for the
  full reasoning on all three.

Prescription-gated items follow whatever the backend's existing prescription-validation rule returns —
`addToCart()`'s own 400 keeps them out of the cart entirely, and `bookOrder()`'s own validation is what's
authoritative for the direct-order path; the mobile UI never duplicates either check as the real gate
(brief §10's own rule).

**Payment deferred to Phase 8**, same as every prior phase: `isConfigured()`'s 503 is the actually
reachable outcome in this dev environment (`RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` blank), handled as a
calm `serviceUnavailable` state in both the cart-checkout and prescription-purchase flows; the
success-path plumbing is implemented and unit-tested against a fake only.

Exit: catalogue→cart→checkout→payment-or-unavailable→order-history flow tested; a prescription-required
item's actual purchase path (direct order booking, confirmed by reading the real `addToCart()`/
`bookOrder()` code — not the cart) verified to defer entirely to the backend's own response, never a
client-side check that could be bypassed by a modified client.

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
