# ABIES Mobile — Flutter Architecture

Single Flutter codebase for Android + iOS, per the brief's preference. Nothing found in this repository
makes native-per-platform demonstrably better, so Flutter stands without needing a decision from anyone.

## 1. Repository placement

```
apps/mobile/
  lib/
    core/            # api client, env config, router, theme, storage, observability
    features/        # one folder per domain, mirrors the backend's module boundaries
      auth/
      profile/
      home/
      doctors/
      appointments/
      panchakarma/
      diagnostics/
      pharmacy/
      prescriptions/
      payments/
      notifications/
      support/
      contact/
    shared/           # design-system widgets used by 2+ features (cards, buttons, skeletons)
    main_dev.dart main_uat.dart main_prod.dart   # one entrypoint per environment flavor
  android/
  ios/
  test/
    unit/ widget/ integration/
```

Feature folders mirror `apps/platform-api/src/app/api/v1/<domain>` on purpose — a change to the
`appointments` API and the `appointments` feature should be reviewable side by side without translating
names in your head.

Each feature is `data/` (API calls + DTOs), `domain/` (models, no Flutter imports), `presentation/`
(screens, widgets, state). `data/` is the only layer allowed to import the API client.

## 2. State management: Riverpod

Chosen over Bloc for this app specifically: most screens are "fetch from one or two backend routes,
show it" (doctor list, appointment list, order history) rather than complex multi-step event choreography,
and Riverpod's provider composition maps cleanly onto "this screen needs the current session + this one
list + this one filter" without the boilerplate of a Bloc per screen. If a specific flow (checkout,
booking) turns out to need an explicit state machine, use `riverpod`'s `StateNotifier`/`AsyncNotifier`
for just that flow rather than switching frameworks.

## 3. API client (`core/api/`)

Built on `dio`, because it's the only mainstream Dart HTTP client with first-class interceptors and a
pluggable cookie jar — both load-bearing here (see API-GAP-ANALYSIS.md 2 on the session cookie).

- `dio` + `cookie_jar`'s `PersistCookieJar`, backed by a `flutter_secure_storage`-encrypted file, not
  plain app storage — the session cookie is a bearer credential and must be treated like one even though
  it's transported as a cookie.
- One interceptor: attaches `X-Request-Id` (a client-generated UUID) to every request for correlation
  with backend logs (`logger` already includes a request id — confirm the response header name matches
  once Phase 2 is wired up, don't assume).
- No refresh-token interceptor: the backend has no refresh token, only a rotating session cookie that
  `requireSession()` updates server-side on response. The client's only job is to keep sending the cookie
  it has and store whatever `Set-Cookie` comes back — dio's cookie manager does this automatically.
- A 401 anywhere triggers one thing: drop the local session state and route to sign-in. Never attempt a
  silent re-auth; there's nothing to re-auth with.
- Environment switching via Dart's compile-time `--dart-define` (three entrypoints, three build
  configs), not a runtime toggle — a production build must not be able to point at dev by flipping a
  setting.
- Base URLs (see CURRENT-BACKEND-API.md 7 — only dev actually exists):
  - DEV: `https://dev.abies.in`
  - UAT: *(no environment exists yet — placeholder `https://uat.abies.in`, confirm before Phase 11)*
  - PROD: *(no environment exists yet — placeholder `https://abies.in`, confirm before Phase 11)*
- Errors map 1:1 onto the backend's existing `{ error, issues? }` shape (`errorResponse()` in
  `packages/domain/src/lib/errors.ts`) into a typed `ApiException` with the same `issues` field the web
  client already reads for field-level form errors — same contract, same UX pattern as `apps/client-web`'s
  `ApiError`.

## 4. Navigation and deep links: `go_router`

- Declarative routes mirroring the URL shape the brief wants resolvable as deep links
  (`/doctor/:slug`, `/product/:id`, `/appointment/:id`, `/diagnostics/:id`, `/panchakarma/:id`).
- Every deep-link route resolves against the real public API before navigating (API-GAP-ANALYSIS.md 7) —
  a route guard that 404s falls back to opening the URL in the system browser, never a blank screen.
- Auth-gated routes use `go_router`'s redirect hook keyed off the Riverpod auth state, not a per-screen
  check.

## 5. Offline / caching strategy

- A thin cache layer (`core/cache/`) wrapping `drift` (SQLite) or, if the data volume doesn't warrant a
  real database, `hive` — for **non-sensitive, list-shaped** content only: doctor/medicine/Panchakarma
  catalogue listings, so the home screen and search aren't blank on a cold start with no network.
- **Never cached**: session token (already in secure storage, not this cache), prescriptions, clinical
  notes, payment details, appointment PII beyond what's needed to render "you have an appointment
  tomorrow at 4pm with Dr. X" offline.
- Write operations (booking, payment, cart checkout) are never queued for offline retry — the backend is
  authoritative for availability and price at the moment of the call (brief 7, 12); a stale offline
  write would be wrong by the time it's replayed. Show "you're offline, try again" instead.
- `connectivity_plus` for network-state detection, driving the skeleton/offline UI states (brief 3, 19).

## 6. Push notifications (Phase 9, once API-GAP-ANALYSIS.md 4 lands)

`firebase_messaging` for Android; the same package also carries iOS delivery through FCM's APNs bridge,
so one Dart-side integration covers both platforms (native iOS still needs the APNs key uploaded to the
Firebase project — a credential step, see IMPLEMENTATION-PLAN.md 11). On receipt of a token (new install,
token refresh), register it via the new device-token endpoint; deregister on logout.

## 7. Observability

A thin abstraction (`core/observability/`) around crash/error reporting so the provider (Sentry, Firebase
Crashlytics, or Harbor/self-hosted later) is swappable without touching feature code. Captures: crashes,
unhandled errors, API failures (status + path + request id, never the body), app version, OS version,
device class, network type at time of failure. Never logs: OTP codes, session tokens, passwords, full
request/response bodies for auth or payment endpoints — same redaction discipline the backend's
`redactForStorage()` already applies, mirrored client-side.

## 8. Environments, flavors, and release architecture

Three flavors (`dev`, `uat`, `prod`) via Android product flavors + iOS schemes, each with its own
`--dart-define`-injected base URL, app id suffix (so dev/uat/prod can be installed side by side on one
test device), and icon badge. CI builds all three from the same source tree; only `prod` ever goes to
Play Store/App Store (IMPLEMENTATION-PLAN.md 11).
