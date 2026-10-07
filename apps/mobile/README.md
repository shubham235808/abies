# ABIES Mobile (Flutter)

Patient-facing Android + iOS app for the ABIES Ayurveda platform. Consumes the same `/api/v1/*` backend
the website uses (see `docs/mobile/CURRENT-BACKEND-API.md`) — no separate database, no duplicated
business logic. Read `docs/mobile/MOBILE-ARCHITECTURE.md` before changing anything structural here.

## Status — honest, as of 2026-10-07

Phase 1 (foundation), Phase 2 (auth + patient profile) and Phase 3 (home dashboard) of
`docs/mobile/IMPLEMENTATION-PLAN.md`, **now actually verified**, not just written. Flutter 3.47.6
(stable), a Temurin JDK 21 and the Android SDK (platform 35/36, build-tools) are installed and this ran
for real:

- `flutter pub get` — resolved all 84 dependencies from this `pubspec.yaml` with no changes needed.
- `flutter analyze` — clean. Two real issues it caught in the original hand-written draft are fixed:
  `secure_cookie_storage.dart` had an invented `close()` method that isn't part of `cookie_jar`'s actual
  `Storage` interface (removed), and a redundant null-check in `patient_profile.dart` (fixed).
- `flutter test` — **all 35 unit tests pass** (the original 11, plus 24 added for Phase 3), for real,
  under the actual Flutter test runner.
- `android/` was generated for real by `flutter create --org in.abies --project-name abies_mobile
  --platforms=android`, then merged in without touching the hand-written `lib/`, `pubspec.yaml`, or
  `analysis_options.yaml` (which gained a generated `exclude: - android/**` line).
- `flutter build apk --debug --dart-define=ABIES_ENV=dev -t lib/main_dev.dart` — **built a real, valid
  APK** (`build/app/outputs/flutter-apk/app-debug.apk`, ~184MB unoptimized debug build with Phase 3's
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
