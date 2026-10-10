# ABIES Diagnostics (LAB partner app)

Flutter app for diagnostic-lab partners (role `LAB`). It's one of the five role apps in the mobile-architecture
spec. Its structure mirrors `apps/mobile`: the same `ApiClient`, which uses the `abies_session` cookie jar backed
by secure storage, plus the same env flavors, brand theme, Riverpod and go_router.

Run: `flutter run --dart-define=ABIES_ENV=dev -t lib/main_dev.dart` (or `uat` / `prod` entrypoints).

## What it does
- **Auth:** password sign-in (primary), forced password setup for legacy OTP-only accounts, forgot password, and
  "Apply as a lab partner". That last flow is OTP-based (`/auth/otp/request` with `role: LAB` and `/auth/otp/verify`).
  It only works for a new number when the server has `ALLOW_LAB_SELF_ONBOARDING=true`. A non-LAB session is rejected
  and logged out.
- **Dashboard:** shows the verification status. A lab that isn't approved yet gets profile and catalogue steps plus
  submit-for-verification. An approved lab sees pipeline counts and active, completed or all orders.
- **Order fulfilment:** SCHEDULED → sample collected (collector, barcode, quality exception) → processing → report
  released. The report can carry an optional PDF/JPG/PNG file and a critical flag.
- **Catalogue:** tests and packages. You can list, add, edit, activate or deactivate, and delete.

## Verification
`flutter analyze` and `flutter test` (unit tests for every controller, using fake API doubles).
Not yet run on a device or emulator.
