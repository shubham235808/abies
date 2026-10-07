# Mobile API Gap Analysis

What the mobile apps need that the existing backend (see CURRENT-BACKEND-API.md) doesn't yet provide,
or provides in a form mobile can't use as-is. Each gap says what's missing, why it matters for mobile
specifically (not "would be nice"), and a proposed fix sized to not duplicate backend logic.

Severity: **Blocker** (a phase can't ship without it), **Should-fix** (works around it, but shouldn't
ship to production like that), **Later** (genuine gap, not on the critical path).

## 1. No OpenAPI/Swagger spec — Should-fix, blocks contract testing

Every request/response shape has to be read from the zod schema + route handler source by hand. That's
fine for one person reading 244 routes once; it's not fine for an agent (or a second engineer) building
against them over 12 phases without silently drifting from the real contract.

**Fix**: generate OpenAPI 3.1 from the existing zod schemas (`zod-to-openapi` or similar) as a build step
in `packages/domain`, served at `/api/v1/openapi.json` in dev only. This is additive — no existing route
changes — and gives Phase 1's Dart model generation (if used) and Phase 21's contract tests something
real to run against. Not required to start Phase 1, but should land before Phase 4 (the first phase with
non-trivial request bodies).

## 2. Cookie-only session — Blocker for Phase 2

`requireSession()` reads `cookies()` via Next.js's server API. There is no `Authorization: Bearer <token>`
path anywhere in `/api/v1/*`. Two ways to make mobile auth work, in order of recommendation:

**Option A (recommended): keep the cookie, carry it correctly.** `dio` + `cookie_jar` (or `dio_cookie_manager`)
gives Flutter a real cookie jar; persist it in `flutter_secure_storage` (Keychain/Keystore-backed) between
app launches. No backend change at all — same session rows, same rotation, same revocation path the web
already has. The only backend work is confirming `Set-Cookie` attributes (`SameSite`, `Secure`) don't
assume a browser context that breaks a native HTTP client — they don't today (checked), but worth a
regression test once a device actually round-trips one.

**Option B: add a parallel bearer-token mode to `requireSession()`.** Accept `Authorization: Bearer <token>`
as an alternative to the cookie, matched against the same `Session` table. More surface area to secure
(a leaked bearer token has no `SameSite`/`HttpOnly` protection), and it's a change to the authentication
core used by every one of the 244 routes — not something to decide unilaterally. If Option A turns out to
have a real problem in practice (not hypothetical — test it in Phase 2), escalate this as a decision, not
a default.

**Recommendation going into Phase 1**: build the API client around Option A. No backend change required.

## 3. OTP delivery has no path for a phone-only sign-up — Blocker for Phase 2

Today, `requestOtp()` only delivers by email, and only if the account has one on file. SMS doesn't exist
as a channel; WhatsApp is off pending template approval. A mobile user who registers with just a mobile
number — the natural mobile sign-up, and the brief's own expectation ("OTP verification where supported")
— has no channel that will ever deliver their code in production. The dev-mode bypass (`OTP_DEV_CODE`/
`EXPOSE_DEV_OTP`) is explicitly not available outside non-production deployments.

This is a product/business decision, not an engineering one — it determines what "sign up" even means on
mobile at launch.

**Decision (2026-10-07): prioritize WhatsApp OTP delivery**, ahead of other WhatsApp use cases. The
engineering side of this is now built and tested, gated entirely behind the existing `WHATSAPP_ENABLED`
switch and the MSG91 WhatsApp template map — it sends nothing until both are turned on, which stays a
separate, human, sandbox-verified step (`packages/domain/src/lib/notifications/msg91-whatsapp.ts`'s own
"VERIFY BEFORE ACTIVATION" note, unchanged by this work):

- `notifyMailbox()` (`packages/domain/src/modules/notifications/notifications.service.ts`) now takes a
  `channel` (`EMAIL` or `WHATSAPP`) and can address a raw mobile number with no `User` row required —
  the same no-user-yet case Contact Us already needed, reused here for a sign-up that doesn't exist as
  an account yet.
- `requestOtp()` (`packages/domain/src/modules/auth/auth.service.ts`) now also calls
  `notifyMailbox(mobile, 'WHATSAPP', 'auth.otp_code', ...)` for every mobile-identifier request —
  additive, never replacing the existing email send, and it costs nothing today since
  `WHATSAPP_ENABLED=false` makes `attemptDelivery()` record it `SUPPRESSED`/`CHANNEL_DISABLED` without a
  provider call. The moment WhatsApp is switched on with an approved `auth.otp_code` template, phone-only
  sign-up starts working with no further code change.
- Tests: `tests/unit/notifications-mailbox.test.ts` (WhatsApp-channel mailbox sends, the disabled-switch
  suppression path, address validation) and `tests/unit/auth-otp-whatsapp.test.ts` (the new branch in
  `requestOtp()`).

What's still a **human, not engineering, action**: getting the `auth.otp_code` WhatsApp template actually
approved by MSG91/WhatsApp, verifying a real sandbox send against MSG91's current API documentation
(the adapter's own standing warning), and then flipping `WHATSAPP_ENABLED` and
`WHATSAPP_MSG91_TEMPLATE_MAP`. Phase 2 (auth) cannot be called fully done for a phone-only sign-up until
that happens — the code is ready, the activation isn't.

## 4. No push notification channel at all — Blocker for Phase 9, not earlier

No device-token model, no FCM/APNs wiring, `NotificationChannel.PUSH` sends record a permanent failure
today. Net-new backend work, sized small:

- `DeviceToken` model (`userId`, `platform` ANDROID/IOS, `token`, `lastSeenAt`), register/unregister
  endpoints (`POST /api/v1/patients/me/device-tokens`, `DELETE .../[id]`).
- A real `PUSH` adapter in `packages/domain/src/lib/notifications/` (mirrors the existing EMAIL/WhatsApp
  adapter shape) calling FCM HTTP v1 for Android and APNs (via FCM's iOS support, so one adapter covers
  both) for iOS.
- Nothing about *which* events trigger a push changes — `dispatch()`'s routing policy already decides
  per template; PUSH becomes a channel option on existing templates (`appointment.confirmed`,
  `order.shipped`, etc.), not a new business event.

Not a Phase 1-8 blocker: those phases work fully with in-app refresh and the existing EMAIL channel for
anything that must reach the user asynchronously.

## 5. No idempotency key on booking/payment POSTs — Should-fix before Phase 8

`appointments/hold`, `*/verify-payment`, `panchakarma-bookings`, `diagnostic-orders`, `medicine-orders`
accept a POST with no caller-supplied idempotency key. On a web client, a lost response after a flaky
connection is rare enough to have not forced the issue; on Indian mobile networks (brief's own concern,
§19) a client-side retry after a timeout is the common case, not the edge case. Retrying a POST that
already succeeded server-side risks a double booking or a double charge if it isn't idempotent.

**Fix**: accept an optional `Idempotency-Key` header (or body field) on these specific routes, matched
against a short-lived key (the pattern already exists in `notifications.service.ts`'s `idempotencyKey`
column — same idea, applied to the booking/payment write paths). Small, additive, and it protects the
web client too. Needed before Phase 8 (payments) ships, not before Phase 1.

## 6. No feature-flag mechanism — Later

The brief wants backend-controlled flags (§24) so a business change doesn't force a store release. Nothing
like this exists today (`EMAIL_PROVIDER`-style env vars are deploy-time config, not runtime flags readable
by a client). Not on the critical path for Phases 1-9; worth a small `GET /api/v1/config/flags` endpoint
backed by the existing `configuration` module (already has an admin-editable config surface) before
Phase 10.

## 7. Deep-link resolution has no canonical check — Should-fix before Phase 9

The brief wants `abies.in/doctor/...` etc. to open the right screen. The public routes
(`/api/v1/public/doctors/[slug]`, etc.) already resolve a slug to a real resource, so the mobile app *can*
validate a deep link against a real backend lookup before navigating — it just needs to actually do that
(never trust the link's shape alone; a doctor slug that 404s must fall back to the website, not to a blank
screen). This is a client-side implementation discipline, not a backend gap, but it's listed here because
it's easy to skip under schedule pressure and it's a real security/UX issue (brief §20 already requires
the safe fallback).

## 8. Summary — what blocks what

| Gap | Severity | Blocks |
|---|---|---|
| OTP has no phone-only delivery path | Blocker | Phase 2 (needs a product decision) |
| Session is cookie-only | Blocker (mitigated) | Phase 2 (Option A removes the blocker without a backend change) |
| No push channel | Blocker | Phase 9 only |
| No idempotency key on write paths | Should-fix | Phase 8 |
| No OpenAPI spec | Should-fix | Phase 21 contract tests |
| No feature flags | Later | Phase 10 |
| Deep-link validation discipline | Should-fix | Phase 9 |
