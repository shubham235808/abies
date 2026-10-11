# ABIES Panchakarma Partner (mobile)

Flutter app for `PANCHAKARMA_CENTRE` accounts. Structured like `apps/mobile` (same `core/` layer:
cookie-jar `ApiClient`, flavors, brand theme, observability).

Run: `flutter run --flavor dev --dart-define=ABIES_ENV=dev -t lib/main_dev.dart`

## Status (MVP)
- Auth: password sign-in, forced password setup, forgot password, OTP "Apply as a centre"
  (needs `ALLOW_PANCHAKARMA_CENTRE_SELF_ONBOARDING` on the backend). Non-centre roles are refused.
- Overview dashboard, bookings list, booking fulfilment (schedule / mark attended / cancel; course
  completes automatically on the last attended session), therapy + therapist catalogue, centre
  profile + submit for verification.
- Therapist documents (roster row menu → Documents): list with admin review status + reviewer note,
  upload (PDF/JPG/PNG ≤ 10 MB via `file_picker`), remove, view (fresh 5-minute signed URL opened in
  the system viewer via `url_launcher`).
- Not yet: earnings, notifications, iOS build verification.
- Verified by `flutter analyze` + `flutter test` only; not yet run on a device.
