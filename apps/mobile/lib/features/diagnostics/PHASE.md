# diagnostics

## Phase 6 — implemented

Real diagnostics discovery (tests and packages), booking, order management, report access, and
doctor-recommendation handling (docs/mobile/IMPLEMENTATION-PLAN.md Phase 6), replacing Phase 3's
narrower home preview row and the Phase 1 `/diagnostics/:id` placeholder entirely.

- `GET /api/v1/public/diagnostics` — individual-test search (`diagnostics_search_screen.dart`'s
  "Tests" tab), the full filter set `publicTestSearchSchema` actually accepts
  (`packages/domain/src/modules/diagnostics/catalogue.schemas.ts`): free-text `q`, `city`, plus
  `limit`/`offset` pagination. Same shape as Phase 5's `publicTherapySearchSchema` — confirmed by
  reading the real schema, not assumed.
- `GET /api/v1/public/diagnostics/packages` — a *different* path than `/public/diagnostics`
  (confirmed by reading both routes: `searchPublic()` vs `searchPackagesPublic()`), the "Packages"
  tab. Same query schema, different result shape (`{total, tests}` vs `{total, packages}`).
- `GET /api/v1/public/diagnostics/facets` — `{ cities }` only, same shape as Phase 5's
  `PanchakarmaFacets`.
- `POST /api/v1/diagnostic-orders`, `/verify-payment`, `POST /api/v1/diagnostic-orders/[id]/cancel`,
  `GET /api/v1/diagnostic-orders/[id]`, `GET /api/v1/diagnostic-orders/mine` — `DiagnosticsApi`/
  `DiagnosticBookingFlowController`/`DiagnosticOrdersController`/the booking, order-list and
  order-detail screens.
- `GET /api/v1/diagnostic-recommendations/mine` — `DiagnosticRecommendationsController`/
  `DiagnosticRecommendationsScreen`, with a "book from this recommendation" action.
- `GET /api/v1/reports/mine`, `GET /api/v1/reports/[id]/download` — the real patient-facing report
  access path (see "Two real gaps" below for why these, not the brief's originally-named route).

## testIds XOR packageId — enforced at the type level, not just a runtime check

`bookOrderSchema`'s own rule (`orders.schemas.ts`'s `.refine()`) is mirrored by
`DiagnosticBookingTarget` (`domain/diagnostic_booking_target.dart`): it is constructed as either
`.forTests(List<DiagnosticTestSummary>)` or `.forPackage(DiagnosticPackageSummary)` — there is no
constructor path that can produce one with both `testIds` and `packageId` set. Package booking and
multi-test booking are therefore genuinely different flows (different search-screen selection UI —
tap-to-detail for packages, an explicit multi-select mode for tests — and different detail screens),
not one form with both fields left open and a runtime check to catch a mistake. All tests in a
`.forTests` target must share one `labId` (`bookOrderSchema` takes a single `labId` per order), also
enforced in the constructor (throws `ArgumentError` otherwise).

## Three real gaps found and reported, not worked around

**1. No single-item detail route (the already-known gap, same shape as Phase 5's Panchakarma gap)**:
there is no `/public/diagnostics/[id]` and no `/public/diagnostics/packages/[id]` — confirmed by
reading every route under `apps/platform-api/src/app/api/v1/public/diagnostics*`. Same resolution as
Panchakarma: `DiagnosticTestDetailScreen`/`DiagnosticPackageDetailScreen`/`DiagnosticBookingScreen`
read their data from `GoRouter`'s `extra` — the exact object the search screen already fetched —
never re-fetched by id. Opened cold (no `extra`) they show an honest "start from search" state. The
booking flow's own re-fetch-before-booking discipline (below) is adapted around this same absence.

**2. `GET /api/v1/diagnostic-orders/[id]/report-download` is doctor-only, not the patient's report
route** — a gap beyond the already-known one, found by actually reading the route
(`apps/platform-api/src/app/api/v1/diagnostic-orders/[id]/report-download/route.ts`):
`requireRole(ctx, 'DOCTOR')`, calling `getReportDownloadUrlForDoctor()`, which requires the caller to
be the doctor on the order's own `recommendation`. A patient calling this route gets a 403, full stop.
The real patient-facing path — confirmed by also reading `docs/mobile/SECURITY-DESIGN.md §8`, which
names it directly — is the generic patient document library: `GET /api/v1/reports/mine` (list) and
`GET /api/v1/reports/[id]/download` (a 5-minute signed URL, returned as `{ url }` JSON, **not** a
302 redirect the way Phase 4's doctor photo route is — confirmed by reading `reports.service.ts`'s
`downloadUrl()` and the route's own comment, not assumed from the photo-route precedent). This app
therefore never calls `/diagnostic-orders/[id]/report-download` at all. Resolving *which* generic
report belongs to a given order requires an extra step: `DiagnosticReport` (the lab-side row, included
on `/diagnostic-orders/[id]`) and `Report` (the generic patient-library row `/reports/mine` returns)
are two separate tables with two different ids — linked only by `Report.sourceEntityType ==
'DiagnosticOrder'` and `Report.sourceEntityId == order.id` (confirmed by reading `orders.service.ts`'s
`releaseReport()`, which creates one row in each table). `DiagnosticReportController` does this lookup
every time rather than caching a report id anywhere.

**3. `POST /api/v1/diagnostic-recommendations/[id]/cancel` is doctor-only, not something a patient can
call** — found by reading the real route: `requireRole(ctx, 'DOCTOR')`, and `cancelRecommendation()`
itself checks `recommendation.doctorProfile.userId !== doctorUserId`, with no patient branch at all.
The task brief described this as something "the patient can act on (book from, or cancel)" — reading
the actual code shows only the first half is real. `DiagnosticRecommendationsScreen` therefore offers
only "book from this recommendation", never a cancel action that would just surface a 403.

## Booking re-fetch discipline, adapted from Phase 4/5's own rule

Since there's no single-item detail route (gap 1 above), `DiagnosticBookingFlowController
.confirmBooking` re-runs the real search endpoint (`searchTests`/`searchPackages`, scoped by name)
immediately before calling `/diagnostic-orders`, and refuses to book if the fresh search no longer
contains the exact id+labId pair — the navigation `extra` object is never trusted as still accurate at
the moment of booking. For a multi-test target this is one re-fetch per distinct test name (bounded by
`testIds`' own max of 10) — every one must still resolve, or the whole booking is refused as a
conflict. Client-side validation (a chosen date/time in the future; a non-empty address when
`collectionMode == HOME`) runs *before* any network call, surfaced as its own
`DiagnosticBookOutcomeKind.validationError` — never relies on the backend's 400 alone.

## Recommendation-to-booking

A `DiagnosticRecommendation` carries no `labId` — "a recommendation is clinical intent, not a specific
booking" (`recommendations.service.ts`'s own comment), since the same test/package name can be offered
by several labs. `DiagnosticRecommendationsController.findBookableOptions` searches the real catalogue
by the recommendation's own test/package name to find the current lab options, the patient picks one
(auto-selected if there's exactly one), and the resulting `DiagnosticBookingTarget` carries the
recommendation's `id` through to `DiagnosticBookingScreen`/`bookOrder()`'s `recommendationId` field —
unit-tested in `diagnostic_recommendations_controller_test.dart` and
`diagnostic_booking_flow_controller_test.dart`.

## Report access respects docs/mobile/SECURITY-DESIGN.md §8

Two separate, explicit actions on `DiagnosticOrderDetailScreen`, neither automatic
(`DiagnosticReportController`):

- **View**: fetches a fresh signed URL (`GET /api/v1/reports/[id]/download`) and hands it to the
  system browser/viewer via `url_launcher` (`LaunchMode.externalApplication`) — never an in-app
  WebView (SECURITY-DESIGN.md §9 reserves that for Razorpay checkout only). Nothing is written to
  device storage for this action.
- **Download**: fetches a fresh signed URL and saves the bytes to this app's own private sandbox
  directory (`ReportFileDownloader`, `path_provider`'s `getApplicationDocumentsDirectory()`) — never
  shared/public storage. Deliberately does not auto-open or auto-share the saved file; that would need
  its own separate explicit tap this phase doesn't build a UI for.

`ReportFileDownloader` deliberately bypasses `ApiClient` with a bare `Dio()` instance, documented with
the same justification as Phase 4's `DoctorDetailScreen` pointing `Image.network` directly at the
signed photo-redirect URL: the signed URL is a different host (object storage), not this app's own
`/api/v1/*` backend, so the cookie jar/request-id interceptor don't apply.

## Payment, read from the real code before building anything

`bookOrder()` in `packages/domain/src/modules/diagnostics/orders.service.ts` checks
`isConfigured()` (`packages/domain/src/lib/payments/razorpay.ts`) *first*, before even looking up the
lab/test/package — identical gate to every prior phase's booking flow. `RAZORPAY_KEY_ID`/
`RAZORPAY_KEY_SECRET` are blank in this environment's `.env`, so every real booking attempt here throws
a 503 `ServiceUnavailableError` before any order/payment row is even created.
`DiagnosticBookingFlowController` treats that as its own `DiagnosticBookOutcomeKind.serviceUnavailable`
state — a calm, expected banner, never an error toast or a crash. The full success path
(`DiagnosticBookingCreationResult`, parsed from `bookOrder()`'s real raw `{ order, payment,
razorpayOrder, razorpayKeyId }` shape — **not** wrapped in `{ order: ... }` the way `/verify-payment`
and `/cancel` are, confirmed by reading the route) and `/verify-payment` are implemented and
unit-tested against a fake API, but not reachable in this environment and have no real Razorpay
Flutter SDK call behind them — deferred to Phase 8, same as every prior phase.

## Domain models (`domain/`)

`DiagnosticTestSummary`/`DiagnosticPackageSummary` (the two search endpoints' real result shapes,
fuller than Phase 3's `DiagnosticPreview`), `DiagnosticTestSearchResult`/`DiagnosticPackageSearchResult`
(`{total, tests}`/`{total, packages}`, no offset/limit echoed back — same note as Phase 5's
`PanchakarmaSearchResult`), `DiagnosticFacets` (`{cities}` only), `DiagnosticBookingTarget` (the
testIds-XOR-packageId type, see above), `DiagnosticBookingArgs` (target + optional
`recommendationId`), `DiagnosticBookingCreationResult` (`/diagnostic-orders`'s raw success shape),
`DiagnosticOrderDetail` (the one model covering `/mine`'s, `/[id]`'s, and `/cancel`'s three
differently-included response shapes, null-safe across all three — same relationship Phase 4/5's
detail models had), `DiagnosticOrderItem` (nested item row), `DiagnosticRecommendation` (the
doctor-initiated recommendation, with the doctor-only-cancel gap documented), `DiagnosticReportRef`
(the generic `Report` row from `/reports/mine`, with the two-tables-two-ids gap documented).

`DiagnosticOrdersController.cancel` reloads the full `/mine` list afterwards rather than patching one
entry in place — same reasoning as every prior phase's cancel flow, and necessary here too since
`/cancel`'s own response is a bare, un-included order row (no lab/items/report/payment joins —
confirmed by reading `cancelOrder()`'s final `findUniqueOrThrow`).

## Still not this phase

- No real Razorpay Flutter SDK integration (Phase 8, once real keys exist to test against — see
  above).
- No single-test/single-package detail *route*, and no patient-facing recommendation-cancel route (see
  the three gaps above) — this phase's screens work around the absence honestly (navigation `extra`
  for the first, never building a UI that would just 403 for the third), but real backend gaps remain,
  flagged in `docs/mobile/IMPLEMENTATION-PLAN.md`'s Phase 6 entry for follow-up.
- `DiagnosticOrderListScreen`/`DiagnosticsSearchScreen`/`DiagnosticRecommendationsScreen` are reachable
  via `/diagnostics`, `/diagnostics/orders`, `/diagnostics/recommendations`, and from tapping Phase 3's
  home-dashboard diagnostics tiles, but there's still no persistent bottom-nav/tab shell in this app (a
  Phase 3-and-earlier scope choice, unrevisited here).
- The multi-test "select mode" on the tests search tab is deliberately simple (checkbox selection +
  a floating "Book N tests" action, disabled across labs) — no persistent cross-screen cart.
