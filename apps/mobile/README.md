# ABIES Mobile (Flutter)

Patient-facing Android + iOS app for the ABIES Ayurveda platform. Consumes the same `/api/v1/*` backend
the website uses (see `docs/mobile/CURRENT-BACKEND-API.md`) — no separate database, no duplicated
business logic. Read `docs/mobile/MOBILE-ARCHITECTURE.md` before changing anything structural here.

## Status — honest, as of 2026-10-07

Phase 1 (foundation), Phase 2 (auth + patient profile), Phase 3 (home dashboard), Phase 4 (doctor
discovery and appointments) and Phase 5 (Panchakarma discovery and bookings) of `docs/mobile/
IMPLEMENTATION-PLAN.md`, **now actually verified**, not just written. Flutter 3.47.6 (stable), a Temurin
JDK 21 and the Android SDK (platform 35/36, build-tools) are installed and this ran for real:

- `flutter pub get` — resolved all dependencies from this `pubspec.yaml` with no changes needed.
- `flutter analyze` — clean.
- `flutter test` — **all 92 unit tests pass** (the original 72 through Phase 4, plus 20 added for Phase
  5), for real, under the actual Flutter test runner.
- `android/` was generated for real by `flutter create --org in.abies --project-name abies_mobile
  --platforms=android`, then merged in without touching the hand-written `lib/`, `pubspec.yaml`, or
  `analysis_options.yaml` (which gained a generated `exclude: - android/**` line).
- `flutter build apk --debug --dart-define=ABIES_ENV=dev -t lib/main_dev.dart` — **built a real, valid
  APK** (`build/app/outputs/flutter-apk/app-debug.apk`, ~184MB unoptimized debug build with Phase 5's
  code added).

**What's still not verified**: this APK has not been installed or run on a device or emulator — the
analyzer/test/build passing is strong evidence the code is sound, not proof every screen behaves
correctly at runtime. **iOS cannot be built or verified at all from this environment** — that needs
Xcode on macOS, which doesn't exist here; nothing in this repo claims otherwise.

If you're reading this on a different machine without the SDK installed: get Flutter from
https://flutter.dev, run `flutter pub get` in this directory, and `flutter analyze`/`flutter test`
should both be clean, since they already are here.

## What Phase 2 added

Sign-in by mobile or email + OTP, sign-up (name required for a new account), session bootstrap/logout,
and a profile screen (edit profile, add/remove family members, view and withdraw consent) — all against
real existing backend routes, nothing invented (`docs/mobile/CURRENT-BACKEND-API.md` §2-3). The router
now gates every screen but `/sign-in` and `/otp` behind a real session check.

**Known gap, not a bug**: a brand-new sign-up with only a mobile number (no email on file) has no live
OTP delivery channel yet — WhatsApp OTP is wired server-side but switched off pending template approval
(`docs/mobile/API-GAP-ANALYSIS.md` §3). Test this flow with an email, or with the backend's dev-mode OTP
bypass, until that's turned on.

## What Phase 3 added

The real personalized home dashboard, replacing the Phase 1/2 bare placeholder. `HomeController` loads
eight sections once signed in — upcoming appointments (`GET /api/v1/appointments/mine`, filtered
client-side to future + non-cancelled), three "active orders" subsections (medicine orders, diagnostic
orders, Panchakarma bookings, each filtered client-side to not-yet-delivered/completed and
non-cancelled), and four horizontal preview rows (doctors, Panchakarma therapies, diagnostic tests,
medicines, each `GET /api/v1/public/<domain>?limit=8`) — all against real existing routes, nothing
invented. Each section carries its own `AsyncValue` and its own retry, loading skeleton and empty state,
so one section failing never blanks out the rest of the dashboard.

**Location decision, made deliberately for this phase, not an oversight**: the four catalogue previews
use the signed-in patient's own `PatientProfile.city` (already collected in Phase 2) as their location
signal — passed as the `city` query param to doctors/Panchakarma/diagnostics and as `area` to medicines
(that catalogue's filter field is actually named `area`, confirmed against
`publicMedicineSearchSchema` in `packages/domain/src/modules/medicines/catalogue.schemas.ts` — it is
*not* `city` there). This phase does not add a geolocation/GPS package and does not request device
location permission at all; a patient with no city on their profile simply gets the unfiltered
catalogue, which is the required graceful fallback, reached here just by never asking the device for a
location in the first place.

## What Phase 4 added

Real doctor discovery and the appointment booking/management flow, against routes Phase 3's home
preview already hinted at using only `city`/`limit`:

- **Search** (`lib/features/doctors/`): `GET /api/v1/public/doctors` with the full filter set
  (`q`, `city`, `specialty`, `language`, `mode`, `accepting`, pagination), `GET /api/v1/public/doctors/
  facets` for real filter option values, and a doctor detail screen (`GET /api/v1/public/doctors/
  [slug]` + `/reviews`) that replaces the Phase 1 `/doctor/:slug` placeholder. A slug that doesn't
  resolve shows a clean "not available" state, never a blank screen (`docs/mobile/
  API-GAP-ANALYSIS.md` §7). The doctor's photo (`/photo` route) is confirmed by reading that route to be
  a public 302 redirect to a signed storage URL — no auth needed, so the detail screen's `Image.network`
  points at it directly.
- **Booking** (`lib/features/appointments/`): `GET /api/v1/appointments/slots` → `POST .../hold` →
  payment-or-unavailable → confirmation, driven by `BookingController`. Availability is never trusted
  from an earlier fetch — `confirmBooking` always re-fetches the slot list immediately before calling
  `/hold`, and refuses to hold a slot that fresh fetch no longer lists.
- **Payment, read directly from the real code before building anything** (`holdSlot()` in
  `packages/domain/src/modules/appointments/appointments.service.ts`): `RAZORPAY_KEY_ID`/
  `RAZORPAY_KEY_SECRET` are blank in this environment's `.env`, so every real `/hold` call here returns
  a 503 before any appointment/payment row is even created. The booking flow treats that as its own
  calm, expected `serviceUnavailable` state ("booking isn't available in this environment yet"), not an
  error or a crash. The full success-path plumbing (`AppointmentHold`, `/verify-payment`) is implemented
  and unit-tested against a fake, but has no real Razorpay Flutter SDK call behind it — that's an
  explicit Phase 8 dependency (`docs/mobile/API-GAP-ANALYSIS.md` §5), not something this phase could
  have tested end to end in this environment regardless.
- **Appointment management**: a full "my appointments" list (`GET /api/v1/appointments/mine`'s complete
  joined shape — doctor, clinic, family member, payment, consultation — not Phase 3's narrower
  dashboard summary), with cancel (`POST .../cancel`) and review (`POST .../review`) actions inline.
- Two small, deliberate edits to Phase 3's already-shipped `home_screen.dart`: the doctor preview card
  and the "Upcoming appointments" tile are now tappable (to `/doctor/:slug` and `/appointments`), and
  the AppBar gained a search icon to `/doctors` — the three smallest changes needed to actually reach
  this phase's new screens, per Phase 3's own "tapping a card does nothing yet — Phases 4+" note.

## What Phase 5 added

Real Panchakarma discovery and the booking/management flow (`lib/features/panchakarma/`), structurally
the closest analog to Phase 4's appointments flow (search a facility → pick a therapy → book →
pay-or-unavailable → manage the booking), against routes Phase 3's home preview already hinted at using
only `city`/`limit`:

- **Search** (`panchakarma_search_screen.dart`): `GET /api/v1/public/panchakarma` with the real filter
  set `publicTherapySearchSchema` accepts — just `q`/`city`/`limit`/`offset`, deliberately smaller than
  doctors' (no specialty/language/mode/accepting fields exist for Panchakarma) — and
  `GET /api/v1/public/panchakarma/facets` (`{cities}` only). `GET /api/v1/public/panchakarma-centres` —
  a *different*, centre-centric path (confirmed by reading both routes) — powers a separate, browse-only
  centres screen.
- **A real gap, found and reported rather than worked around**: neither a single-therapy
  (`/public/panchakarma/[id]`) nor a single-centre (`/public/panchakarma-centres/[id]`) detail route
  exists anywhere under `apps/platform-api/src/app/api/v1/public/panchakarma*` — confirmed by reading
  every file there, not assumed from the doctors analog's `/[slug]`. The therapy detail and booking
  screens read their data from `GoRouter`'s navigation `extra` (the exact object the search screen
  already fetched from the real API) instead of re-fetching by id; the centres screen is a plain list
  with nothing to tap into. See `lib/features/panchakarma/PHASE.md` and this phase's entry in
  `docs/mobile/IMPLEMENTATION-PLAN.md` for the full detail and the suggested backend follow-up.
- **Booking** (`panchakarma_booking_flow_controller.dart`): `POST /api/v1/panchakarma-bookings`, driven
  by a session-count picker (`bookTherapySchema` has no slot/time concept at all, unlike appointments).
  Adapting Phase 4's own rule to the contract that actually exists here, `confirmBooking` never trusts
  the navigation `extra` object as still accurate — it re-runs the real `/public/panchakarma` search
  (scoped by the therapy's name and centre city) immediately before booking, and refuses to proceed if
  that fresh search no longer contains the exact centre+therapy pair.
- **Payment, read directly from the real code before building anything** (`bookTherapy()` in
  `packages/domain/src/modules/panchakarma/bookings.service.ts`): `RAZORPAY_KEY_ID`/
  `RAZORPAY_KEY_SECRET` are blank in this environment's `.env`, and `isConfigured()` is checked *first*
  in `bookTherapy()`, before the centre/therapy are even looked up — so every real booking attempt here
  returns a 503 before any booking/payment row is created. This phase treats that as its own calm,
  expected `serviceUnavailable` state, exactly mirroring Phase 4's handling of `holdSlot()`'s same gate.
  `/verify-payment` is implemented and unit-tested against a fake but not reachable here — an explicit
  Phase 8 dependency, same as Phase 4.
- **Booking management**: a full "my Panchakarma bookings" list (`GET /api/v1/panchakarma-bookings/
  mine`) opening into a detail screen (`GET /api/v1/panchakarma-bookings/[id]`) with session schedule,
  therapist names once assigned, and cancel (`POST .../[id]/cancel`).
- Two small, deliberate edits to `home_screen.dart`: the Panchakarma preview card and the Panchakarma
  active-bookings tile are now tappable (to `/panchakarma` and `/panchakarma/bookings` — the preview
  card's thinner model has no centre id to jump straight to a specific therapy with, and there's no
  detail-by-id route to resolve one against regardless, so the real search screen is the honest
  destination) — the same minimal, justified pattern Phase 4 used for doctor cards.

## Layout

See `docs/mobile/MOBILE-ARCHITECTURE.md` 1 for the full rationale. Short version: `lib/core/` is
environment-agnostic infrastructure (API client, router, theme, storage), `lib/features/<domain>/` mirrors
the backend's own `/api/v1/<domain>` module boundaries, `lib/shared/` is cross-feature design-system
widgets. Every feature folder here is currently an empty placeholder with a one-line note on which
implementation phase fills it in — none of them are implemented yet except what Phase 1 itself covers
(the core layer).

## Environments

Three flavors via Dart compile-time defines, not a runtime switch (`lib/core/env/app_env.dart`):

```
flutter run --dart-define=ABIES_ENV=dev
flutter build apk --dart-define=ABIES_ENV=prod
```

Only `dev` (`https://dev.abies.in`) is a real, deployed environment today. `uat` and `prod` base URLs in
`app_env.dart` are placeholders — see `docs/mobile/CURRENT-BACKEND-API.md` 7.
