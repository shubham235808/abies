# home

## Phase 3 — implemented

The real personalized home dashboard (docs/mobile/IMPLEMENTATION-PLAN.md Phase 3), replacing the Phase
1/2 bare placeholder. `HomeController` (`presentation/home_controller.dart`) loads, once signed in:

- `GET /api/v1/appointments/mine` → filtered client-side to **upcoming** (future, not cancelled) for
  "Upcoming appointments".
- `GET /api/v1/medicine-orders/mine`, `/diagnostic-orders/mine`, `/panchakarma-bookings/mine` → each
  filtered client-side to **active** (not delivered/completed, not cancelled) for three "Active orders"
  subsections (Medicines, Diagnostics, Panchakarma).
- `GET /api/v1/public/doctors`, `/public/panchakarma`, `/public/diagnostics`, `/public/medicines` (each
  with `?limit=8`) → four horizontal preview rows.

Every one of the eight sections carries its own `AsyncValue`, loaded independently
(`AsyncValue.guard`) — one section failing (e.g. the medicines catalogue is briefly down) never blanks
out the others, and each section has its own retry (`HomeController.retry*`), loading skeleton, and
empty-state message, using the shared `state_views.dart`/`loading_skeleton.dart` widgets.

**Location, deliberately scoped out of this phase**: the four public catalogue previews use the
signed-in patient's own `PatientProfile.city` (`ProfileController`, Phase 2) as the location signal —
passed as `city` to doctors/panchakarma/diagnostics and as `area` to medicines (that catalogue's filter
field is literally named `area` in `publicMedicineSearchSchema`, not `city` — verified against
`packages/domain/src/modules/medicines/catalogue.schemas.ts`). This phase does **not** add a
geolocation/GPS package and does **not** request device location permission — a patient with no city set
on their profile simply gets the unfiltered catalogue (the brief's own required fallback behavior,
achieved here just by never asking the device for a location at all). See
`apps/mobile/README.md`'s "What Phase 3 added" for the same note.

Sign-out (AppBar) and the link to `/profile` (now an AppBar icon, previously a body button) are both
still there — this phase didn't remove either.

## Still not this phase

- Tapping a doctor/therapy/test/medicine preview card does nothing yet — doctor detail, therapy/test/
  product detail, and every booking/cart/checkout flow are Phases 4-7.
- No search bar, no facets/filters beyond the implicit city/area signal, no "see all" screens for any of
  the four catalogues — those are part of the Phase 4-7 discovery/listing screens, not the home dashboard.
- No push notifications, no promotional banners, no recommendations engine.
- No pull-to-refresh analytics/observability wiring beyond what Phase 1's `Observability` abstraction
  already provides.
