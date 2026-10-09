# Password-auth backend

Status: backend only (packages/domain, packages/domain/prisma,
apps/platform-api/src/app/api/v1/auth/*). No frontend/mobile UI changed.
Not committed — left for review.

## What changed, in one paragraph

Existing registered users now sign in with a password instead of a
routine OTP. OTP is repurposed as the verification step for
password-setup/recovery only. Every account created before this change
has `passwordHash = null` (the migration marker — no separate
migration-status field), and `login()` treats that as a forced,
one-time "set your password" state rather than a login failure: the
caller proves OTP control first, then sets a password, same as the
voluntary forgot-password flow. Public/guest browsing is untouched —
this only changes how someone who *does* sign in authenticates.

## Schema

- `User.passwordHash String?` — additive, nullable. `null` = legacy
  OTP-only account (pre-this-change, or never completed setup).
- `UserRole` gets two new values: `FINANCE`, `SUPER_ADMIN`. Purely
  additive — no existing `ADMIN` row is remapped, no `ADMIN` behavior
  changed.
- Migration: `packages/domain/prisma/migrations/20261009120000_password_auth/migration.sql`,
  generated via `prisma migrate diff --from-schema <pre-edit snapshot>
  --to-schema prisma/schema.prisma --script` (not `prisma format` on the
  whole file — kept the diff to exactly these two changes).

**Validated**: applied the full migration chain (all 39 migrations,
including this one) from empty to a throwaway `abies_shadow_check`
database created on the existing `abies-postgres` container
(`prisma migrate deploy` against it), confirmed `User.passwordHash` and
the two new `UserRole` enum values exist, then dropped the throwaway
database. The real shared dev database was never written to — it was
already 11 migrations behind this one (pre-existing, unrelated to this
change) and modifying it wasn't part of this task.

## New/changed files

- `packages/domain/src/lib/password.ts` (new) — `hashPassword`/
  `verifyPassword`, Argon2id via the `argon2` package (added to
  `packages/domain/package.json`; `pnpm-lock.yaml` regenerated).
  **`pnpm-workspace.yaml`** also needed `argon2: true` added to
  `allowBuilds` — pnpm refuses to run argon2's native build script
  otherwise (`ERR_PNPM_IGNORED_BUILDS`), so without it the package
  installs but password hashing fails at runtime. This is one file
  outside the stated packages/domain|prisma|auth-routes scope, but
  required for argon2 to actually work; flagging it explicitly.
- `packages/domain/src/lib/env.ts` — new `RATE_LIMIT_LOGIN_MAX` (default
  10) / `RATE_LIMIT_LOGIN_WINDOW_SECONDS` (default 300), mirroring the
  existing `RATE_LIMIT_OTP_REQUEST_*` pair.
- `packages/domain/src/modules/auth/auth.schemas.ts` — `loginSchema`,
  `requestPasswordResetSchema`, `completePasswordSetupSchema`,
  `resetPasswordSchema`. Password fields enforce a 12-char minimum via
  zod only (no complexity rules — see the reasoning comment in
  `password.ts`); passphrases with spaces are accepted.
- `packages/domain/src/modules/auth/auth.service.ts` — added `login()`,
  `requestPasswordReset()`, `completePasswordSetup()`, `resetPassword()`,
  plus a private `consumeOtpChallenge()` helper factored out of the
  existing `verifyOtp()` (and reused by the new password flows) and a
  private `verifyOtpAndSetPassword()` shared by `completePasswordSetup`/
  `resetPassword` so the OTP-verify + hash + session-revocation logic
  exists exactly once.
- `packages/domain/src/server/permissions.ts` — added `FINANCE: []` and
  `SUPER_ADMIN: []` to the `ROLE_PERMISSIONS` map (required just to keep
  this file's exhaustive `Record<UserRole, Permission[]>` compiling once
  the two roles exist; see "Needs a decision" below).
- Four new route files under
  `apps/platform-api/src/app/api/v1/auth/`: `login/route.ts`,
  `password/forgot/route.ts`, `password/setup/route.ts`,
  `password/reset/route.ts` — same thin-handler style as the existing
  `otp/request` and `otp/verify` routes.
- Tests: `tests/unit/password.test.ts` (hash/verify round-trip, wrong
  password rejected, malformed hash doesn't throw, distinct salts) and
  `tests/unit/auth-password.test.ts` (12 cases covering `login`,
  `requestPasswordReset`, `completePasswordSetup`, `resetPassword` —
  mocked prisma/env/session/rate-limit/password, same style as the
  existing `tests/unit/auth-otp-whatsapp.test.ts`).

## API contract (for the frontend/mobile phase)

All four routes are POST, JSON in/out, same error shape as every other
route (`{ error: string }` via `errorResponse`, or `{ error, issues }`
for a zod validation failure).

### `POST /api/v1/auth/login`

Request:
```json
{ "mobile": "9876543210", "password": "at least 12 characters" }
```
or `{ "email": "...", "password": "..." }` — exactly one of
`mobile`/`email`, never both (zod `refine`, 400 otherwise).

Response, password-login success (sets the `abies_session` cookie, same
as `otp/verify`):
```json
{ "requiresPasswordSetup": false, "user": { "id", "mobile", "email", "role" }, "mfaRequired": false }
```

Response, legacy account with no password yet (200, **not** an error —
no cookie set):
```json
{ "requiresPasswordSetup": true, "mobile": "+919876543210" }
```
The client must route this into the forced-setup flow: call
`password/forgot` with that mobile, then `password/setup`.

Failure (401, identical for "no such account", "wrong password", and
"account not ACTIVE" — never reveals which):
```json
{ "error": "Invalid credentials" }
```
429 (`{"error": "Too many login attempts. Please try again later."}`)
after `RATE_LIMIT_LOGIN_MAX` attempts per identifier within
`RATE_LIMIT_LOGIN_WINDOW_SECONDS`.

### `POST /api/v1/auth/password/forgot`

Request: `{ "mobile": "..." }` or `{ "email": "..." }` (same
exactly-one-of rule). Used for both the voluntary "forgot password" flow
and the forced first-time setup flow — same endpoint either way.

Response — **always** this shape, whether or not the account exists:
```json
{ "requestId": "...", "expiresInSeconds": 300 }
```
For a real account this is a genuine `OtpChallenge` id (delivered via
WhatsApp/email exactly like the existing OTP-login flow). For an unknown
account, or if the underlying OTP request itself fails (e.g. cooldown),
`requestId` is a placeholder that will simply fail like any other wrong
code if used — the client can't tell the two cases apart from the
response, by design.

### `POST /api/v1/auth/password/setup`

Forced first-time case. Request:
```json
{ "requestId": "...", "otp": "123456", "newPassword": "at least 12 characters" }
```
Success (200, sets a fresh `abies_session` cookie): `{ "user": {...} }`.
On success, every pre-existing session for the account is revoked.
Failure: 401 `incorrect OTP` / `too many attempts` / `expired or
invalid`, or 400 for a zod validation failure (password too short, etc).

### `POST /api/v1/auth/password/reset`

Identical request/response shape to `password/setup`; same underlying
logic, different audit action (`PASSWORD_RESET_COMPLETED` vs
`PASSWORD_SET`). Voluntary forgot-password case — account already has a
password.

## Audit events (all `eventType: "AUTH"`, via the existing
`recordAuditEvent`)

| action | when |
|---|---|
| `LOGIN_SUCCESS` | password login succeeds |
| `LOGIN_FAILURE` | unknown account, wrong password, or non-ACTIVE account |
| `PASSWORD_RESET_REQUESTED` | `requestPasswordReset` found a real account and issued an OTP |
| `PASSWORD_SET` | `completePasswordSetup` succeeds (forced first-time case) |
| `PASSWORD_RESET_COMPLETED` | `resetPassword` succeeds (voluntary case) |

No password, OTP code, or session token value is ever passed into
`metadata` or logged — only ids (`userId`, `sessionId`) and request
context (`ip`, `userAgent`), matching the existing `recordAuditEvent`
convention. The existing OTP-login path keeps its original `LOGIN`
action name unchanged (routine OTP login — doctors/admins/staff using
OTP continue to show up under `LOGIN`; the new `LOGIN_SUCCESS`/
`LOGIN_FAILURE` pair is specific to the password path, so the two are
distinguishable in the audit log).

## Rate limiting

`RATE_LIMIT_LOGIN_MAX`/`RATE_LIMIT_LOGIN_WINDOW_SECONDS` (default
10/300s) guard `login()` itself, keyed per-identifier
(`ratelimit:login:<mobile-or-email>`) via the same `checkRateLimit()`
Redis counter the OTP path already used (`server/rate-limit.ts`) — this
is brute-force protection on one account's password, so it's enforced
inside `auth.service.ts`, not at the IP-scoped `proxy.ts` layer the OTP
*request* endpoint uses (that layer is per-app middleware outside this
task's stated file scope, and guards request volume per caller rather
than guesses per account — a different threat). The existing
`OTP_COOLDOWN_SECONDS` per-mobile cooldown still applies unchanged to
`password/forgot` (it calls `requestOtp()` under the hood).

## Things that need a decision before Phase 3 (frontend/mobile)

1. **`FINANCE` and `SUPER_ADMIN` have no permissions or portal access
   defined yet.** The schema/enum change was explicit in the brief, but
   nothing says what either role can actually do, which portal
   (management-web?) they log into, or whether `SUPER_ADMIN` should
   inherit everything `ADMIN` has (today `ROLE_PERMISSIONS` gives both
   empty arrays, i.e. "logs in, can't do anything yet"). Needs a
   decision before any frontend work gates a screen on either role.
2. **No UI/route exists yet to drive the forced-setup flow.** `login()`
   returning `requiresPasswordSetup: true` is a contract, not a
   screen — Phase 3 needs to build the "set your password" interstitial
   (call `password/forgot` then `password/setup`) for every app with a
   login screen (client-web, partner-web, management-web, mobile).
3. **`ADMIN_MFA_REQUIRED` interaction**: `createSession()` already
   forces `mfaVerified: false` for a new `ADMIN` session when
   `ADMIN_MFA_REQUIRED` is true, regardless of how the session was
   created (OTP or password) — this was not changed and the new
   `login()` path goes through the same `createSession()`, so an admin
   logging in with a password still has to complete
   `/auth/mfa/verify` afterward, same as today. Confirming this is the
   intended behavior for `SUPER_ADMIN`/`FINANCE` too (should they also
   require MFA?) is bundled into decision #1.
4. **No endpoint yet to let a user *voluntarily* change their password
   while already signed in** (only the two OTP-gated paths — forced
   setup and forgot-password — exist). If product wants "change
   password" from an authenticated settings screen without an OTP
   round-trip, that's a new, smaller endpoint, not built here (it
   wasn't in the brief's IMPLEMENT list).
5. **Rate-limit tuning**: `RATE_LIMIT_LOGIN_MAX=10` per 5-minute window
   per identifier is a starting guess (matching the existing
   `RATE_LIMIT_OTP_REQUEST_MAX=20`/5min order of magnitude), not a
   number anyone has reviewed.

## Known pre-existing issue, confirmed NOT touched by this change

~20 integration test files (`tests/integration/*.test.ts`) call
`requestOtp(mobileString, role)` with a plain string instead of
`{ mobile: mobileString }` — a pre-existing bug unrelated to this task
(flagged by the user before this work started). `requestOtp()`'s
signature was not changed by this change. These files still fail
`npx vitest run tests/integration` for that reason; this was true
before this change too and is not something this task was asked to fix.

## Verification performed

- `npx vitest run tests/unit` (repo root): **385 passed, 0 failed** (28
  files) — baseline measured immediately before this work was
  **369 passed** (26 files; not the 378 mentioned in the task
  description — reporting the actual measured number). The 16 new tests
  are `tests/unit/password.test.ts` (4) and
  `tests/unit/auth-password.test.ts` (12). No existing test was changed
  or regressed.
- `npx tsc --noEmit -p packages/domain`: clean.
- `npx tsc --noEmit -p apps/platform-api`: clean.
- Migration validated against a throwaway database created on the real
  Postgres container (see "Schema" above), not the shared dev database.
- `npx vitest run tests/integration`: pre-existing failures only (the
  `requestOtp(mobile, role)` old-call-shape bug noted above); not
  something this task touched or was asked to fix.
