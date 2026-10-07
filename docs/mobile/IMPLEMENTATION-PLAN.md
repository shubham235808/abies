# ABIES Mobile — Implementation Plan

Phases match the brief's own phasing (its §26). Each phase lists what ships, which existing backend
routes it consumes (no new backend work unless stated), and its exit criteria — a phase is not done
because it compiles; it's done when every row in its exit-criteria table is true, per the brief's own
quality gates (§27).

A phase is implemented, tested, documented, and committed before the next one starts (brief §25). Phases
within one feature area (e.g. 4-7, which are all "pick something, pay for it") share the same cart/order/
payment plumbing built in Phase 1, so they move faster than the phase numbers alone suggest — but each
still gets its own exit check before merging.

## Phase 0 — Discovery and architecture (this set of documents)

Deliverables: this doc, CURRENT-BACKEND-API.md, API-GAP-ANALYSIS.md, MOBILE-ARCHITECTURE.md,
SECURITY-DESIGN.md, TEST-STRATEGY.md. **Exit**: presented for review (per the brief's own §30
instruction) before any Flutter code is written.

## Phase 1 — Project foundation

Flutter project at `apps/mobile/`; `core/` (api client with the Option A cookie-jar approach, env/flavor
config, router skeleton, theme tokens, secure storage wrapper); empty shells for each feature folder;
CI job that runs `flutter analyze` + `flutter test` on every PR (no build/sign yet — that's Phase 11).

No backend calls with real data yet beyond `GET /api/v1/health` as an API-client smoke test.

Exit: analyzer clean, unit tests for the api client's error-mapping and the cookie-jar persistence pass,
CI green, `docs/mobile/IMPLEMENTATION-PLAN.md` phase checklist updated.

## Phase 2 — Authentication and patient profile

Consumes: `POST /api/v1/auth/otp/request`, `POST /api/v1/auth/otp/verify`, `GET /api/v1/auth/me`,
`POST /api/v1/auth/logout`, `GET/PATCH /api/v1/patients/me`, `GET/POST /api/v1/patients/me/family`,
`GET /api/v1/consent/me`, `POST /api/v1/consent/[artifactId]/accept`.

**Blocked on a product decision** (API-GAP-ANALYSIS.md 3): what a phone-only sign-up does when there's
no email on file to deliver the OTP to. Implementation can start with "email required at sign-up" as the
interim behavior and swap it once that decision lands — but Phase 2 is not *complete* until the real
answer is implemented, not the interim one.

Exit: registration, login, logout, session persistence across app restart, profile edit, family-member
CRUD, consent accept/withdraw all exercised by integration tests against a real dev-environment backend
(not mocks) at least once, in addition to unit/widget tests against mocks.

## Phase 3 — Home dashboard

Consumes: `GET /api/v1/public/doctors`, `/public/panchakarma`, `/public/diagnostics`, `/public/medicines`
(all already support facets/filters), `GET /api/v1/appointments/mine`, `GET /api/v1/medicine-orders/mine`,
`GET /api/v1/diagnostic-orders/mine`, `GET /api/v1/panchakarma-bookings/mine`.

Location-aware sections use device location only after an explicit permission prompt; denial falls back
to the same content unfiltered by distance (brief §5) — this is a client-side requirement, not a backend
gap, since the public catalogue routes already accept a location/area parameter.

Exit: home renders fully from live dev-environment data (no hardcoded placeholder content left in),
graceful empty/offline/skeleton states for each section, location permission denial path tested.

## Phase 4 — Doctor discovery and appointments

Consumes: `GET /api/v1/public/doctors`, `/public/doctors/facets`, `/public/doctors/[slug]`,
`/public/doctors/[slug]/reviews`, `GET /api/v1/appointments/slots`, `POST /api/v1/appointments/hold`,
`POST /api/v1/appointments/verify-payment`, `POST /api/v1/appointments/[id]/cancel`,
`POST /api/v1/appointments/[id]/review`.

Availability is never computed client-side — slot listing and hold are both server round-trips, every
time, including right before showing "book now" as enabled (brief §7's own rule).

Exit: full search→book→pay→confirm flow against the real dev backend, double-booking attempt (two holds
on the same slot) verified to fail server-side as expected, cancellation and review flows tested.

## Phase 5 — Panchakarma

Consumes: `GET /api/v1/public/panchakarma`, `/public/panchakarma-centres`, `/public/panchakarma/facets`,
`POST /api/v1/panchakarma-bookings`, `/verify-payment`, `GET /api/v1/panchakarma-bookings/mine`,
`POST /api/v1/panchakarma-bookings/[id]/cancel`.

Exit: facility→therapy→booking→payment→history flow tested end to end against the real backend.

## Phase 6 — Diagnostics

Consumes: `GET /api/v1/public/diagnostics`, `/packages`, `/facets`, `POST /api/v1/diagnostic-orders`,
`/verify-payment`, `GET /api/v1/diagnostic-orders/mine`, `/[id]/report-download`,
`POST /api/v1/diagnostic-orders/[id]/cancel`.

Report download reuses the same authorized-download pattern as prescriptions (SECURITY-DESIGN.md 8).

Exit: booking→payment→status→report-download flow tested; report download verified to fail for a
non-owning account (authorization test, not just a happy-path test).

## Phase 7 — Pharmacy and prescriptions

Consumes: `GET /api/v1/public/medicines`, `/facets`, `GET/POST /api/v1/patients/me/cart`,
`/cart/items/[id]`, `/cart/[id]/checkout`, `GET /api/v1/medicine-orders/mine`, `/[id]`,
`POST /api/v1/medicine-orders/verify-payment`, `/[id]/cancel`, `/[id]/review`,
`GET /api/v1/patients/me/prescriptions`.

Prescription-gated items follow whatever the backend's existing prescription-validation rule returns on
checkout — the mobile cart never has its own "is this a prescription medicine" logic that could drift
from the backend's (brief §10's own rule).

Exit: catalogue→cart→checkout→payment→order-history flow tested; a prescription-required item's
checkout-time enforcement verified to come from the backend response, not a client-side check that could
be bypassed by a modified client.

## Phase 8 — Payments

No new UI beyond what Phases 4-7 already built (payment is a step inside each of those flows, not a
separate screen tree) — this phase is the hardening pass: idempotency on retried submissions
(API-GAP-ANALYSIS.md 5 must land before this phase is called done), backend-verification-is-authoritative
tested explicitly (mobile never marks an order "paid" from a client-side payment-provider callback alone
— it waits for the backend's own verify-payment response).

Exit: a simulated flaky-network retry of a payment submission is verified not to create a duplicate
order/charge; a forced mismatch between provider callback and backend verification is verified to leave
the order in a non-paid state.

## Phase 9 — Push, WhatsApp/email triggers, deep links

Requires API-GAP-ANALYSIS.md 4 (device-token model + PUSH adapter) to exist first — this phase is
blocked on that backend work, not purely a mobile task. Also requires a Firebase project (credential/
account step — IMPLEMENTATION-PLAN.md 11) to exist before device registration can be tested for real.

WhatsApp/email are never called directly from mobile with provider credentials (brief §14) — mobile only
ever triggers them indirectly, by doing the same backend action (place an order, book an appointment)
that already causes `dispatch()` to send on whatever channels are configured.

Deep links resolve against the real public API before navigating (API-GAP-ANALYSIS.md 7), with a
website fallback for anything that doesn't resolve.

Exit: device token registers/deregisters correctly across install, token-refresh, and logout; a real
push is received end to end in the dev environment; a deep link to a resource that doesn't exist falls
back to the website, verified by test, not by inspection.

## Phase 10 — Security hardening, observability, performance

Runs the full SECURITY-DESIGN.md checklist against the app built in Phases 1-9 (not a parallel-track
item — it's a gate on everything already built). Observability abstraction wired to a real provider.
Performance pass: cold-start time, list-scroll jank, image loading on the catalogue screens.

Exit: SECURITY-REVIEW.md produced per the brief's §22 process, zero unresolved Critical/High findings.

## Phase 11 — Android/iOS release engineering

Requires, as credentials/accounts only the business can provide (not an engineering blocker, but a real
one — flag these early, don't wait until this phase to ask):

- A Google Play Console developer account and app listing.
- An Apple Developer Program account, App Store Connect app record, APNs key/certificate.
- A Firebase project (for Phase 9's push, reused here for release-side crash reporting if that's the
  chosen provider).
- Android keystore (generated once, backed up outside source control, never regenerated — losing it
  blocks all future updates to the same app listing).
- Confirmation of the real UAT/prod API hostnames (CURRENT-BACKEND-API.md 7 — these don't exist yet).

CI/CD: `flutter analyze` → tests → dependency/security scan → Android build (per flavor) → iOS build →
signing → artifact upload → manual release approval → store delivery. This pipeline is separate from the
Kubernetes GitOps flow — it does not touch ArgoCD, Tekton-for-backend, or any cluster resource (brief
§23's own rule); it can live as its own CI config (e.g. a dedicated Tekton pipeline using a Flutter/
Android/Xcode-capable runner, or a separate CI system if the cluster's build nodes can't run Xcode for
iOS — macOS build infrastructure is a real constraint to confirm, not assume).

Exit: a signed build installs from each store's internal testing track.

## Phase 12 — Production readiness review

`docs/mobile/PRODUCTION-READINESS.md`, `PLAY-STORE-RELEASE.md`, `APP-STORE-RELEASE.md` produced and
reviewed against every quality gate in brief §27, for every phase, not just the last one.
