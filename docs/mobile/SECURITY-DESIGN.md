# ABIES Mobile — Security Design

The backend remains authoritative for every decision listed in the brief's Critical Rule (identity,
authorization, availability, pricing, payments, prescriptions, consent, audit). Nothing below changes
that; this is only about protecting the client and the transport.

## 1. Transport

TLS only, no cleartext fallback (Android `usesCleartextTraffic=false`, iOS ATS left at its secure
default — do not add an ATS exception). The cluster already terminates TLS at Envoy Gateway with a real
Let's Encrypt certificate for `dev.abies.in`; mobile trusts the public CA chain like any other HTTPS
client — **no certificate pinning** is proposed for v1. Pinning adds an operational failure mode (a
routine cert renewal can lock out every installed app) for a benefit that's marginal once a trusted CA
and HSTS-equivalent discipline are already in place; revisit only if a specific threat model requires it.

## 2. Session / token storage

Per API-GAP-ANALYSIS.md 2 (Option A): the session is a cookie, not a token mobile code constructs. It's
stored via `flutter_secure_storage`, which is backed by Android Keystore (`EncryptedSharedPreferences`)
and iOS Keychain respectively — never `shared_preferences` / plain files, which are not encrypted at
rest. The cookie is never written to any log, crash report, or analytics event. Logout clears the cookie
jar and calls `POST /api/v1/auth/logout` (revokes the `Session` row server-side) — never only a local
clear, since a locally-cleared-but-server-valid session is a token that still works if it leaks.

## 3. Biometric unlock

Optional, app-level convenience only (`local_auth`), gating access to an already-stored session — it is
never a replacement for the backend's own authentication or session expiry. A failed or unavailable
biometric check falls back to the existing OTP sign-in, never to a reduced-security bypass.

**Status, re-checked Phase 10**: still not built. `local_auth` remains a declared-but-unused Phase-1
dependency (`pubspec.yaml`) — no gate exists anywhere in `lib/`. This is correct, not a gap: it was
never required by any phase through 8, and Phase 10's own brief was explicit that this pass audits and
hardens existing code, not add new optional features.

## 4. Authorization discipline

Every protected action is re-checked server-side; the client hiding a button is cosmetic only, never the
actual control (brief 16's own rule, restated here because it's the one most likely to be violated under
schedule pressure — e.g. "doctor can edit their own availability" must be enforced by the
`doctors/me/availability` route's existing role-check, not by which tab the app shows).

## 5. Root / jailbreak posture

Detect (not block) via a maintained library (`freerasp` or similar) and surface a non-blocking warning
on genuinely sensitive screens (payment, prescription view). Hard-blocking the app on a rooted device is
a support burden disproportionate to the actual risk reduction for a healthcare-adjacent commerce app;
reserve a hard block for a specific future finding that justifies it, not as a default.

**Status, re-checked Phase 10**: still not implemented, correctly — no root/jailbreak-detection
dependency or code exists anywhere in this app. Reserved for a future finding, per this section's own
posture; Phase 10 found no such finding.

## 6. Screenshot / screen-recording restriction

Scoped narrowly, per the brief's own instruction ("only for genuinely sensitive screens where justified"):
the prescription document viewer and any screen rendering a full payment instrument. Not applied
app-wide — over-applying this breaks legitimate use (a patient screenshotting their appointment
confirmation to share with a family member) for no real security gain.

**Status, re-checked Phase 10**: correctly not added anywhere — confirmed not added app-wide, and
deliberately still not added to either of this section's own named targets, because neither exists as
an in-app screen to restrict:

- No payment-instrument screen exists. Every booking/checkout flow (Phases 4-8) stops at a `503`
  `serviceUnavailable` state before any real payment UI renders (`RAZORPAY_KEY_ID`/`SECRET` are blank in
  this environment) — there is no card/UPI input screen in this app at all yet.
- No in-app prescription document viewer exists either. Phase 7 found `Prescription` carries no
  storage-key/document field in the schema — there is genuinely nothing to view. The one real in-app
  document flow that does exist, diagnostic reports (Phase 6), deliberately opens the signed URL in the
  *external* system browser/viewer (`url_launcher`), never inside this app's own window — a
  Flutter-side screenshot restriction (`FLAG_SECURE` or equivalent) only covers this app's own rendered
  surface, so it would protect nothing even if added here; the external viewer is outside this app's
  control.

Revisit this once either a real payment-instrument screen or an in-app document viewer is actually
built.

## 7. Logging and PII

Mirrors the backend's existing `redactForStorage()` discipline (`packages/domain/src/modules/
notifications/notifications.service.ts`) on the client: never log OTP codes, session cookies, full
request/response bodies on auth/payment/prescription endpoints, or raw medical text. Crash reports
include the request path and status code, not the payload.

**Status, verified Phase 10**: audited directly, not assumed. Every `print`/`debugPrint`/logging call
in all of `lib/` was grepped (not just the obvious spots) — no hit logs a session cookie, OTP, password,
or response body; the only matches were unrelated `AlertDialog builder:` callbacks. `ApiClient._mapError()`
(`lib/core/api/api_client.dart`) was checked specifically, in every build mode: it extracts only
`message`/`issues`/`statusCode`/`requestId` from a failed response and never forwards the raw body
anywhere, debug-only path or otherwise.

This section's "crash reports include the request path and status code, not the payload" clause is now
a real, implemented behavior, not just a design intention: `Observability` (`lib/core/observability/
observability.dart`) has a real implementation as of Phase 10 — `SentryHttpObservability`
(`lib/core/observability/sentry_http_observability.dart`, gated on a `SENTRY_DSN` dart-define, Noop
when unset, which is every build so far). `recordApiFailure`'s own signature only ever accepts
`path`/`statusCode`/`requestId` — there is no parameter for a body to leak through. Whatever string a
caller does pass to `recordError` (an exception's `toString()`, a short `context` label) is additionally
run through `redactForObservability()`, which masks anything email-shaped and any run of 4+ digits
(OTP codes, mobile numbers) before it's sent — see that file's doc comment and
`test/unit/observability_test.dart` for the redaction tests.

## 8. File handling (prescriptions, diagnostic reports)

Downloaded documents go through the backend's existing authorized download endpoints
(`/api/v1/reports/[id]/download`, `/api/v1/doctors/me/documents/[id]/download`, etc. — see
CURRENT-BACKEND-API.md 2), which already enforce ownership/role checks server-side. On-device, a
downloaded file is written to app-private storage (not shared/public storage), and any "open in" /
"share" action goes through an explicit user tap, never an automatic export.

## 9. WebViews

The only WebView in scope is Razorpay's hosted checkout (payment must stay backend-initiated,
provider-hosted — brief 12). No general-purpose WebView for app content; every other screen is native
Flutter. The checkout WebView is launched only with a URL/order token the backend issued for that
specific transaction, never a client-constructed URL.

## 10. Dependency and build security

- `flutter pub outdated` + a dependency-vulnerability scanner (e.g. `osv-scanner`) in CI before every
  build (ties into IMPLEMENTATION-PLAN.md 11's pipeline).
- Signing keys (Android keystore, iOS distribution certificate/provisioning profile) and store API
  credentials live outside source control — in the CI system's own secret store, never committed,
  never printed in build logs. This repository's existing discipline (`docs/security/
  SECRET-ROTATION-CHECKLIST.md`) extends to these the same way it covers the backend's secrets.

**Status, checked Phase 10**: `flutter pub outdated` was run for real — no package flags a known
vulnerability; the only notices are two discontinued (not insecure) transitive packages
(`flutter_secure_storage_macos`, `js`), neither reachable on this app's actual Android/iOS targets.
Neither `osv-scanner` nor `dart pub audit` (this Dart SDK, 3.13.5, has no `audit` subcommand) is
available in this environment — an honest gap to flag, not something this pass could resolve or should
paper over. Wiring a real scanner into CI stays Phase 11 scope, as this section already says.

## 11. API abuse surface specific to mobile

A mobile client calls the same public, rate-limited routes a browser does (`proxy.ts`'s existing
IP-scoped limits on OTP request, ticket creation, the webhook, and now `/api/v1/contact`). A compiled
app doesn't get a free pass on these — no API key or trusted-client bypass is proposed; the existing
per-IP limits plus (once built) idempotency keys on write paths (API-GAP-ANALYSIS.md 5) are the control,
same as for the web.

## 12. What this document does not cover

Store-side policies (Play Store Data Safety, App Store privacy nutrition label) — covered in
PLAY-STORE-RELEASE.md / APP-STORE-RELEASE.md once those are written (Phase 11). Backend-side security
(payment webhook verification, prescription-validation rules, settlement calculation) is unchanged by
mobile and is not re-documented here — see the existing `docs/platform/` and `docs/security/` docs for
that.
