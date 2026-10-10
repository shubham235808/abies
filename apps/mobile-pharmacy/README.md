# ABIES Pharmacy (Pharmacy & Vendor partner app)

Flutter app for PHARMACY-role partners, structured identically to `apps/mobile`
(Riverpod + go_router + Dio with a secure-storage-backed cookie jar carrying the
`abies_session` cookie; same `ApiClient`, `AppEnv` flavors and `AppTheme`).

## Status (MVP)

- Auth: password sign-in, forced password setup, forgot password, OTP "Apply as a
  pharmacy partner" (works only where `ALLOW_PHARMACY_SELF_ONBOARDING` is on),
  session persistence via `GET /api/v1/auth/me`. Non-PHARMACY accounts are refused.
- Dashboard: verification banner, order buckets, active (paid, unfulfilled) queue.
- Order fulfilment: accept → packing → dispatch (carrier/tracking) → delivered, plus reject/cancel.
- Inventory: list/search/filter own `PharmacyInventory` batches, edit quantity + selling price.

Not yet in the app (use the partner web portal): profile editing and submitting for
verification, adding/removing inventory batches, POS/GST sales, tax settings, earnings.

Verified with `flutter analyze` and `flutter test` only; it has not been run on a device.

## Run

```
flutter run --flavor dev --dart-define=ABIES_ENV=dev -t lib/main_dev.dart
```
