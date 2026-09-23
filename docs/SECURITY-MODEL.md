# Security Model

Written before Phase 1 (auth/RBAC/MFA) implementation, per the brief's
"First Deliverable" ordering. Defines the contract Phase 1 code must satisfy.
Builds on the validated Sprint 2/3 behavior (`docs/DECISIONS.md` D3) and the
brief's mandatory security requirements.

## Authentication

**Primary factor: mobile OTP.**
- Mobile normalized to `+91` + 10 digits, leading digit `[6-9]` (ported
  verbatim from Sprint 3's `normalizeMobile`).
- OTP code is never stored in plaintext: `HMAC-SHA256(OTP_PEPPER, mobile:otp)`.
  `OTP_PEPPER` is a server-only secret, distinct from any per-record salt.
- Cooldown (`OTP_COOLDOWN_SECONDS`, default 30s) between requests per mobile;
  challenge expiry (`OTP_TTL_SECONDS`, default 300s); max verify attempts
  (`OTP_MAX_ATTEMPTS`, default 5) before the challenge is dead.
- Dev-only bypass (`OTP_DEV_CODE`, `EXPOSE_DEV_OTP`) is read only when
  `NODE_ENV !== 'production'`; there is no code path that can activate it in
  production, matching Sprint 3's explicit `throw` on that attempt.
- Role-gated provisioning: a fresh mobile number self-registers only as
  `PATIENT`. `DOCTOR` self-registration is allowed only when
  `ALLOW_DOCTOR_SELF_ONBOARDING=true` (the resulting account still starts
  `DoctorVerificationStatus.DRAFT` — self-registration is not the same as
  being live). All other roles (`ADMIN`, `LAB`, `PHARMACY`,
  `PANCHAKARMA_CENTRE`, `CUSTOMER_SUPPORT`, `TECH_SUPPORT`, `SALES`,
  `CARE_COORDINATOR`) must be provisioned by an admin before that mobile can
  request an OTP for that role.

**Session: HTTP-only cookie, not a client-visible token** (deviation from
Sprint 2/3's bearer pair, per D3/D6 and the brief's explicit "never
localStorage" rule):
- On successful OTP verify, the server creates a `Session` row
  (`tokenHash` = SHA-256 of a random 384-bit token) and sets a cookie
  containing only the raw token: `HttpOnly`, `Secure` (except local dev over
  http), `SameSite=Lax`, `Path=/`, expiry = `SESSION_TTL_DAYS`.
- Every request that needs identity looks up `Session` by `tokenHash`
  (cached in Redis, keyed by token hash, short TTL, invalidated on
  revoke/rotate) — never trusts a client-supplied role/user id.
- Sliding expiry: a valid request past the halfway point of the session's
  life rotates the token (new random value, same row, new `tokenHash`,
  extended `expiresAt`) and resets the cookie. Rotation invalidates the old
  token immediately.
- Logout / "sign out everywhere" sets `revokedAt`; revoked sessions fail
  lookup immediately even if `expiresAt` hasn't passed yet (session
  revocation requirement from the brief).

**Admin MFA:**
- `Session.mfaVerified` gates privileged actions, same as Sprint 3.
  `ADMIN_MFA_REQUIRED` (default true) means a fresh admin session starts
  `mfaVerified=false` and must complete a challenge before any MFA-gated
  route succeeds.
- Privileged actions requiring `mfaVerified=true`: doctor approval/
  suspension, partner suspension, refund approval, role change, audit log
  access, sensitive configuration changes (full list grows as those modules
  land — enforced centrally via `server/rbac.ts`, not ad hoc per route).
- Production MFA provider (TOTP/authenticator or SMS-based) is a Phase 1
  deliverable; until it's wired in, the dev-only static code path from
  Sprint 3 (`DEV_ADMIN_MFA_CODE`) is preserved *only* under
  `NODE_ENV !== 'production'`, identical guard to the OTP dev bypass. There
  is no admin path in production without a real MFA provider configured —
  this is treated as a hard launch blocker, not a "nice to have."

## Authorization (RBAC)

- Roles: `PATIENT, DOCTOR, ADMIN, LAB, PHARMACY, PANCHAKARMA_CENTRE,
  CUSTOMER_SUPPORT, TECH_SUPPORT, SALES, CARE_COORDINATOR`.
- Enforced exclusively server-side, in every route handler and server
  action, via a shared `requireRole()`/`requirePermission()` helper in
  `src/server/rbac.ts`. Frontend visibility (hiding a nav item, disabling a
  button) is a UX nicety, never the authorization boundary — this is
  non-negotiable per the brief.
- Ownership checks (a doctor can only edit *their own* `DoctorProfile`; a
  patient can only see *their own* `PatientProfile`/family members) are
  enforced in the service layer via `where` clauses scoped to the
  authenticated user's id, not by trusting an id passed from the client,
  matching the pattern already validated in Sprint 3's `doctors.service.ts`
  (`profileForOwner(userId)`).
- Staff/partner roles (`LAB`, `PHARMACY`, `PANCHAKARMA_CENTRE`) are scoped
  to their `StaffProfile.organizationId` once the corresponding module
  lands — a lab user must never see another lab's orders.

## Consent

- `ConsentArtifact` (versioned, keyed by `(key, version)`) / `ConsentRecord`
  (per-user acceptance, unique per artifact) — same shape as Sprint 3.
- All active + required artifacts are recorded as accepted on every
  successful OTP verification (re-accepting on each login is intentional:
  it captures IP/user-agent/timestamp evidence each time, and re-prompts
  automatically if a new required version is published).
- Non-required artifacts (e.g. `marketing`) are opt-in only, never
  auto-accepted, and expose an explicit withdraw action that sets
  `withdrawnAt` without deleting the historical record.

## Audit

- Every sensitive action — login, logout, consent change, doctor
  verification transition, document verification, appointment change,
  prescription creation/correction, care plan change, report access,
  payment, refund, role change, support escalation — writes an
  `AuditEvent` via `src/server/audit.ts`'s `recordAuditEvent()`.
- Fields: `userId, sessionId, eventType, resourceType, resourceId, action,
  method, path, statusCode, ip, userAgent, metadata, createdAt`.
- `metadata` never contains PHI (clinical note contents, document bytes,
  full prescription text) — only identifiers, counts, and non-sensitive
  context, so the audit log itself doesn't become a second, less-protected
  copy of the medical record.
- `AuditEvent` rows are never updated or deleted by application code —
  immutability is enforced by omitting update/delete from the audit
  module's public API, not just by convention.

## Data protection

- TLS terminates at Nginx; internal Docker network traffic (app↔Postgres/
  Redis/MinIO) is unencrypted but not exposed beyond the host (D per
  `docs/TARGET-ARCHITECTURE.md`'s deployment topology).
- Object storage is private by default (`src/lib/storage.ts`): every read
  is a short-lived signed URL, generated per-request after an authorization
  check, never a permanent public link.
- Upload validation (MIME allowlist, size limit) happens before a file
  reaches storage, ported from Sprint 3's PDF/JPG/PNG doctor-document
  allowlist and generalized per module (`assertUploadAllowed`).
- Secrets (`SESSION_SECRET`, `OTP_PEPPER`, gateway/provider API keys) are
  environment variables only, never committed; `.env.example` documents the
  shape without real values.
- Rate limiting (OTP requests, login attempts, password-less-relevant here
  but applicable to payment-webhook replay and support-ticket spam) is
  implemented via Redis counters in the relevant module's service layer as
  each module lands — not deferred to a single global gateway, since limits
  differ by endpoint.

## What Phase 1 must deliver against this contract

`src/server/session.ts` (cookie issuance/rotation/revocation, Redis-backed
lookup cache), `src/server/rbac.ts` (`requireRole`/`requirePermission`,
MFA-gate helper), the `modules/auth` OTP request/verify/MFA-challenge flow,
and `modules/consent`'s accept/withdraw endpoints — all exercised by
integration tests re-deriving Sprint 3's `SPRINT3_TEST_PLAN.md` scenarios
against the new cookie-based flow.
