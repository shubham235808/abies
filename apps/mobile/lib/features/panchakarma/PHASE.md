# panchakarma

## Phase 5 — implemented

Real Panchakarma discovery and the booking/management flow (docs/mobile/IMPLEMENTATION-PLAN.md Phase
5), replacing Phase 3's narrower home preview row and the Phase 1 `/panchakarma/:id` placeholder.

- `GET /api/v1/public/panchakarma` — the real search screen (`panchakarma_search_screen.dart`), using
  the full filter set `publicTherapySearchSchema` actually accepts (`packages/domain/src/modules/
  panchakarma/catalogue.schemas.ts`): free-text `q`, `city`, plus `limit`/`offset` pagination
  (`PanchakarmaSearchController.loadMore`). This schema is deliberately smaller than doctors' — no
  specialty/language/mode/accepting fields exist for Panchakarma, confirmed by reading the real schema
  rather than assumed from the doctors analog. Phase 3 only ever used `city` + `limit`.
- `GET /api/v1/public/panchakarma/facets` — `{ cities }` only (`panchakarmaFacetsProvider`); also real,
  also smaller than `DoctorFacets`.
- `GET /api/v1/public/panchakarma-centres` — a *different* path than `/public/panchakarma` (confirmed by
  reading both routes): centre-centric (`listApprovedCentres()`), thin (`{id,name,city,state}` only),
  browse-only (`panchakarma_centres_screen.dart`).
- `POST /api/v1/panchakarma-bookings`, `/verify-payment`, `POST /api/v1/panchakarma-bookings/[id]/cancel`,
  `GET /api/v1/panchakarma-bookings/[id]`, `GET /api/v1/panchakarma-bookings/mine` — `PanchakarmaApi`/
  `PanchakarmaBookingFlowController`/`PanchakarmaBookingsController`/the booking, booking-list and
  booking-detail screens.

**Real gap found and reported, not worked around**: there is no public single-therapy detail route
(no `/public/panchakarma/[id]`) and no public single-centre detail route (no
`/public/panchakarma-centres/[id]`) — confirmed by reading every file under `apps/platform-api/src/app/
api/v1/public/panchakarma*`; only the two list/search routes above exist. Unlike Phase 4's
`GET /public/doctors/[slug]`, there is nothing to resolve a therapy or centre id against:
  - `PanchakarmaTherapyDetailScreen` and `PanchakarmaBookingScreen` read their therapy from
    `GoRouter`'s `extra` — the exact object the search screen already fetched from the real API —
    rather than re-fetching by id. Opened without `extra` (a cold deep link with no in-app navigation
    behind it), they show an honest "start from Panchakarma search" state instead of attempting a
    network call that doesn't exist. This is a real, permanent limitation of this phase's deep-linking,
    not a bug to fix later without backend support.
  - `PanchakarmaCentresScreen` is a plain browse list with nothing to tap into — deliberately not wired
    to a fake "detail" built by filtering `/public/panchakarma` down to one centre's therapies
    client-side, which would only look like a real per-centre contract while quietly depending on an
    unrelated endpoint's `q`/`city` filters. Flagging this for backend follow-up (a
    `/public/panchakarma-centres/[id]` route, analogous to doctors') is the honest fix, not a client
    workaround.

**Booking re-fetch discipline, adapted from Phase 4's own rule** (brief §7): there is no slot/time
concept for Panchakarma (`bookTherapySchema` takes only `centreId`/`therapyId`/`sessionCount`
`recommendationId` — confirmed by reading `bookings.schemas.ts`), so there's nothing to re-fetch from a
`/slots`-equivalent endpoint. Instead, `PanchakarmaBookingFlowController.confirmBooking` re-runs the
real `GET /public/panchakarma` search (scoped by the therapy's own name and centre city) immediately
before calling `POST /panchakarma-bookings`, and refuses to book if that fresh search no longer contains
the exact centre+therapy pair — the navigation `extra` object is never trusted as still accurate at the
moment of booking, same spirit as `BookingController.confirmBooking`'s slot re-fetch, adapted to the
real contract that actually exists here.

**Payment, read from the real code before building anything** (`bookTherapy()` in `packages/domain/src/
modules/panchakarma/bookings.service.ts`, `isConfigured()` in `packages/domain/src/lib/payments/
razorpay.ts`): `RAZORPAY_KEY_ID`/`RAZORPAY_KEY_SECRET` are blank in this environment's `.env`, and
`bookTherapy()` checks `isConfigured()` *first*, before even looking up the centre/therapy — so every
real booking attempt here throws a 503 `ServiceUnavailableError` before any booking/payment row is even
created. `PanchakarmaBookingFlowController` treats that status code as its own
`PanchakarmaBookOutcomeKind.serviceUnavailable` state — a calm, expected banner, never an error toast or
a crash, exactly mirroring Phase 4's `HoldOutcomeKind.serviceUnavailable`. The full success path
(`PanchakarmaBookingCreationResult`, parsed from `bookTherapy()`'s real
`{ booking, payment, razorpayOrder, razorpayKeyId }` shape) and `/verify-payment` are implemented and
unit-tested against a fake API, but not reachable in this environment and have no real Razorpay Flutter
SDK call behind them — deferred to Phase 8, same as Phase 4.

Domain models (`domain/`): `PanchakarmaTherapy` (`/public/panchakarma`'s `therapies[]` — a fuller sibling
of Phase 3's `PanchakarmaPreview`, which stays as-is for the home dashboard), `PanchakarmaSearchResult`
(`{total, therapies}` — no `offset`/`limit` echoed back, unlike `DoctorSearchResult`, confirmed from the
real `searchPublic()` return statement), `PanchakarmaFacets` (`{cities}` only), `PanchakarmaCentre`
(thin, `{id,name,city,state}`), `PanchakarmaBookingCreationResult` (`/panchakarma-bookings`'s success
shape), `PanchakarmaBookingDetail` (the one model covering `/mine`'s, `/[id]`'s, and `/cancel`'s three
differently-included response shapes, null-safe across all three — same relationship Phase 4's
`AppointmentDetail` had to its three response shapes), `PanchakarmaSession` (read-only, nested in a
booking — patient-facing only as data inside a booking response; nothing in this phase writes a
session, that's the centre/therapist side's own routes, out of scope here).

`PanchakarmaBookingsController.cancel` reloads the full `/mine` list afterwards rather than patching one
entry in place — same reasoning as `AppointmentsController`, and necessary here too since `/cancel`'s
own response is a bare, un-included booking row (no centre/therapy/session joins — confirmed by reading
`cancelBooking()`'s final `findUniqueOrThrow`).

## Still not this phase

- No real Razorpay Flutter SDK integration (Phase 8, once real keys exist to test against — see above).
- No recommendation-linked booking flow (`bookTherapySchema`'s optional `recommendationId`,
  `GET /api/v1/panchakarma-recommendations/mine`) — out of this phase's listed endpoint set; booking
  here is always patient-self-initiated from search, never from a doctor's recommendation.
- No single-therapy/single-centre detail *route* (see the gap above) — this phase's screens work around
  the absence honestly (passing the already-fetched object via navigation `extra`), but a real backend
  gap remains, flagged in docs/mobile/IMPLEMENTATION-PLAN.md's Phase 5 entry for follow-up.
- `PanchakarmaBookingListScreen`/`PanchakarmaSearchScreen` are reachable via `/panchakarma/bookings` and
  `/panchakarma` and from tapping Phase 3's home-dashboard Panchakarma tiles, but there's still no
  persistent bottom-nav/tab shell in this app (a Phase 3-and-earlier scope choice, unrevisited here).
