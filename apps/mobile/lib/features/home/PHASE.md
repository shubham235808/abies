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

- **Updated by Phase 4**: tapping a doctor preview card now opens the real doctor detail screen
  (`/doctor/:slug`), the AppBar gained a search icon to `/doctors`, and tapping the "Upcoming
  appointments" tile opens the real appointments list (`/appointments`) — the three smallest, most
  justified edits Phase 4 made to this already-shipped screen, per its own "don't touch home/auth/
  profile except where genuinely necessary" rule. Therapy/test/medicine preview cards still do nothing
  yet — that's Phases 5-7.
- No search bar/facets/filters for the therapy/test/medicine catalogues, no "see all" screens for any of
  those three — Phases 5-7's own discovery/listing screens, not the home dashboard.
- No push notifications, no promotional banners, no recommendations engine.
- No pull-to-refresh analytics/observability wiring beyond what Phase 1's `Observability` abstraction
  already provides.
