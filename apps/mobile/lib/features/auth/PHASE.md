# auth

Phase 2 of docs/mobile/IMPLEMENTATION-PLAN.md — implemented (unverified, see apps/mobile/README.md
"Status"): OTP request/verify, session bootstrap via `GET /api/v1/auth/me`, logout. Sign-up (new
account, no email on file) has no live OTP delivery path until WhatsApp OTP is switched on
(docs/mobile/API-GAP-ANALYSIS.md §3) — build/test against this now, but don't expect a real code on a
phone-only new sign-up until then.

Not done: biometric unlock gate (brief §4's "optional"), forgot-password (there is no password —
OTP-only sign-in, see docs/mobile/CURRENT-BACKEND-API.md §3).
