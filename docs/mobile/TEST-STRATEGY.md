# ABIES Mobile — Test Strategy

## 1. Pyramid

- **Unit** (`test/unit/`): pure Dart — API client error-mapping, DTO parsing, cache logic, idempotency-
  key generation, deep-link resolution logic. No widget tree, no real I/O. Fastest, most numerous.
- **Widget** (`test/widget/`): one screen or reusable component at a time, with the API client mocked
  (never a real network call). Covers loading/empty/error/offline states for every screen, not just the
  happy path — these states are easy to skip and are exactly where "placeholder implementation marked
  complete" (brief §27's explicit warning) tends to hide.
- **Integration** (`test/integration/`, `integration_test` package): a real build, driving real screens,
  against a real backend — the dev environment, never a mock server, for the flows where the backend's
  actual behavior (not a guessed mock) is the point: booking a real slot, a real OTP round-trip (dev-mode
  OTP auto-fill, per this repo's seeded test accounts), a real cart checkout up to (not including) an
  actual payment capture.
- **Golden/visual** (optional, `test/goldens/`): for the design-system components (Agent 3's cards,
  buttons, skeletons) — catches unintended visual regressions across Flutter SDK upgrades.

## 2. Contract tests

Once API-GAP-ANALYSIS.md 1 (OpenAPI generation) lands: generate Dart DTOs from the spec and run a CI
check that the hand-written request/response models haven't drifted from it. Until then, the next best
thing is a smaller, honest one: a scheduled (not per-PR, to avoid flaking on shared dev data) integration
test per domain that hits the real route and asserts the response has the fields the Dart model expects —
catches a backend schema change breaking mobile before a user does.

## 3. Authentication and authorization tests

- Every "signed out" state of a screen that requires auth redirects to sign-in, never renders partial
  data.
- A 401 from any call clears the local session and redirects — tested by forcing a 401 from a mocked
  interceptor layer, not by waiting for a real session to expire.
- Role-scoped behavior (the brief's own emphasis, §16): since the mobile app only ever authenticates as
  `PATIENT`, this is less about many roles and more about verifying the app never assumes client-side
  that an action is allowed — one test per protected action confirms the *request* is sent and the
  *response* (not a local flag) determines what the UI shows next.

## 4. Booking and payment flow tests

- Double-submit protection: tapping "book"/"pay" twice quickly results in one request in flight, not two
  (debounce client-side) — and separately, a forced retry at the network layer is verified not to create
  a duplicate server-side record once Idempotency-Key support (API-GAP-ANALYSIS.md 5) exists.
- Payment result handling: the UI only shows "confirmed" after the backend's own verify-payment response
  says so — a test that stubs a payment-provider "success" callback but a backend verify-payment
  "pending" response must assert the UI stays pending, never confirmed.
- Availability staleness: slots shown from a few seconds ago are re-validated server-side at hold time —
  a test simulates a slot becoming unavailable between list-load and hold, asserts the error surfaces
  correctly rather than silently succeeding or crashing.

## 5. Offline / error-handling tests

- Every screen's three non-happy states (loading, empty, error) plus a fourth mobile-specific one
  (offline, distinct from "error" — brief §19) have at least one widget test each.
- A write action (booking, checkout, payment) attempted while offline shows "you're offline" and does
  not queue the request — verified by asserting no request was enqueued, not just that an error appeared.

## 6. Platform-specific (Android/iOS) tests

- `integration_test` runs on both an Android emulator/device and iOS simulator/device in CI — a flow
  passing on one platform is not evidence it passes on the other (deep-link handling, secure-storage
  backing, and permission-prompt UX all differ enough between platforms to need both).
- Platform-specific permission flows (location, notifications) tested on both platforms separately,
  since the prompt UX and denial-recovery path genuinely differ.

## 7. Security-relevant tests

- Secure storage: a test confirms the session cookie is never written through a code path that isn't
  `flutter_secure_storage` (e.g., accidentally logged, accidentally cached in the offline-content cache).
- Logging redaction: a test asserts a fixture request/response pair containing an OTP code or a session
  value never appears verbatim in whatever the logging/observability abstraction captures.
- Deep link: an invalid or non-existent resource ID in a deep link is verified to fall back to the
  website, not crash or render a blank authenticated-looking screen.

## 8. CI integration

Runs on every PR to `apps/mobile/`: `flutter analyze`, unit + widget tests, dependency/security scan.
Integration tests against the real dev backend run on a schedule and on merge to the mobile integration
branch, not on every PR (dev is a shared environment — see this repo's own note that compose/cluster
commands can affect shared state; the same discipline applies to a shared Postgres-backed dev API).
Platform builds (Phase 11's pipeline) are a separate, heavier job gated on the above passing first.

## 9. What "critical flows require especially strong coverage" means concretely here

Per the brief's §21: appointment booking, Panchakarma booking, diagnostic booking, medicine checkout,
and every payment-adjacent step get both a widget-level test of every UI state *and* at least one
integration test against the real backend, before that phase is called done — not one or the other.
