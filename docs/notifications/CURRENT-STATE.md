# Notifications: Current State (Phase 0 discovery)

Scope: what exists in the repo (`/home/devops/abies/abies`) and gitops (`/home/devops/abies/abies-gitops`) as of 2026-10-06. Every claim below was read in code. Nothing here is a plan.

## Core model and send path

| Piece | Location | What it does today |
|---|---|---|
| `Notification` model | `packages/domain/prisma/schema.prisma` (~L708) | Fields: userId, channel, templateKey, payload (Json), status (QUEUED/SENT/FAILED/READ), providerRef, error, sentAt, readAt, createdAt. No attempts, next-retry, idempotency key, recipient snapshot or template version. |
| `notify()` | `packages/domain/src/modules/notifications/notifications.service.ts` | Creates a QUEUED row, then sends **inline** and awaits. IN_APP is marked SENT at once. PUSH is marked FAILED ("not implemented"). Other channels call `getAdapter()`. Never throws. |
| Adapter selection | `packages/domain/src/lib/notifications/index.ts` | `getAdapter(channel)` reads `SMS_PROVIDER` / `EMAIL_PROVIDER` / `WHATSAPP_PROVIDER`. EMAIL `smtp` and `msg91` return real adapters. `mock` returns the mock adapter unless `isLockedDownDeployment()` (NODE_ENV=production without ALLOW_DEV_AUTH_BYPASS_IN_PROD, `lib/env.ts` L109), in which case null. Any other value returns null. |
| Shared types | `packages/domain/src/lib/notifications/types.ts` | `NotificationAdapter.send(recipient, templateKey, payload)` returns `{ok, providerRef}` or `{ok:false, error}`. |

## Per-channel state

| Channel | Adapter file | Provider setting | Callers of notify() | Status |
|---|---|---|---|---|
| EMAIL | `lib/notifications/smtp-adapter.ts` (nodemailer, plain text only, OTP template only, JSON dump fallback) and `lib/notifications/msg91-adapter.ts` (MSG91 v5 transactional API, 10s timeout, OTP only) | `EMAIL_PROVIDER`: smtp, msg91, mock (default) | 1: `modules/auth/auth.service.ts:91` (`auth.otp_code`) | Real for OTP only. Dev overlay uses msg91. |
| SMS | none. Mock only. | `SMS_PROVIDER` (default mock) | 0. The channel appears in the CRM contact-activity enum and template enum only. | MISSING. Mock logs and returns ok, so the row shows SENT. |
| WhatsApp | none. Mock only. | `WHATSAPP_PROVIDER` (default mock) | 0 (CRM activity enum and template enum only) | MISSING. Same mock behaviour as SMS. |
| In-app | none (DB row only) | n/a | 36 call sites (`appointments`, `medicines/orders`, `diagnostics/orders`, `panchakarma/bookings`, `hospital/admissions`, `support/tickets`, `payments/refunds`, `consultations`, `care-plans`, `crm/automation.service.ts:115`, and others) | Write-only. No list, read or mark-read API exists. `readAt` and READ are never written. |
| Push | none | none | 0 | MISSING. PUSH rows are written as FAILED. |

Totals: 37 literal-channel call sites in `apps/` and `packages/` (36 IN_APP, 1 EMAIL). None sit inside a `$transaction` (checked in appointments, refunds and medicines).

## OTP (`modules/auth/auth.service.ts`)

- `requestOtp` (L31) and `verifyOtp` (L109). Routes: `apps/platform-api/src/app/api/v1/auth/otp/request/route.ts` and `.../otp/verify/route.ts`.
- Code is HMAC-SHA256 with `OTP_PEPPER` over `mobile:otp`. Stored in `OtpChallenge` (TTL `OTP_TTL_SECONDS`=300, cooldown 30s per mobile, `OTP_MAX_ATTEMPTS`=5).
- Delivery: email only, and only when `identifier.email` is set or `OTP_DELIVERY_CHANNEL=email`. The `sms` path is a no-op. Default is `sms` (`lib/env.ts` L99). Production overlays inherit that default.
- `OTP_DEV_CODE` (fixed code) and `EXPOSE_DEV_OTP` (returns `devOtp` in the response) are dev bypasses, disabled under lockdown.
- The plaintext OTP is passed into `notify()` payload and persisted in `Notification.payload`.

## Templates

- `NotificationTemplate` model (schema ~L2528): templateKey unique, channel, subject, body, active.
- CRUD exists: `modules/configuration/configuration.service.ts` L161-183; routes `apps/platform-api/src/app/api/v1/admin/configuration/notification-templates/` (+ `[id]`); admin UI `apps/management-web/src/app/ops/admin/configuration/notification-templates-manager.tsx`.
- **No send path reads the table.** `notify()` never queries it. Rendering is hard-coded: `smtp-adapter.ts` `render()` and the MSG91 variables for `auth.otp_code`. Templates are therefore decorative today.

## Consent and preferences

- `ConsentArtifact` (key, version, title, bodyUrl, required, active) and `ConsentRecord` (userId, artifactId, acceptedAt, withdrawnAt, ip, userAgent). Service: `modules/consent/consent.service.ts`. Login auto-accepts all active required artifacts (`auth.service.ts` L155-162).
- Legal acceptance only. **No channel preference, marketing opt-in, opt-out, unsubscribe or quiet hours.** `PatientProfile.consentPreferences` (Json, `patients.service.ts` L53) is free-form and not read by `notify()`.

## Retries, queue, outbox, dead letters

- None. `bullmq` ^6.3.8 is declared in `packages/domain/package.json` but nothing imports it. `ioredis` (`lib/redis.ts`) serves sessions, rate limits and readiness only.
- No outbox, no attempts counter, no dead-letter state.
- Idempotency: only `CrmAutomationExecution @@unique([ruleId, leadId])` (automation.service.ts comment) and the idempotent Razorpay finalizers. `notify()` has no dedupe key.

## Webhooks

- One route: `apps/platform-api/src/app/api/v1/payments/webhook/razorpay/route.ts`. Verifies HMAC via `verifyWebhookSignature` (`lib/payments/razorpay.ts`), dispatches to finalizers, logs errors and returns 200.
- Webhook rate limit via `RATE_LIMIT_WEBHOOK_*` in each app's `src/proxy.ts`.
- No delivery-receipt webhooks for SMS, email or WhatsApp. No event-id dedupe table.

## RBAC, session, audit

- `packages/domain/src/server/rbac.ts`: `requireSession`, `requireRole`, `requirePermission`, `requireAdminMfa`.
- `server/permissions.ts`: `hasPermission`. No notification-specific permission exists.
- `server/session.ts`: `getSessionByToken`, `Session` model. `server/audit.ts`: `recordAuditEvent`, `AuditEvent` model.

## Env and secrets

- `packages/domain/src/lib/env.ts` L69-99: `SMS_PROVIDER`, `EMAIL_PROVIDER`, `WHATSAPP_PROVIDER` (default mock); `SMS_API_KEY`, `EMAIL_API_KEY`, `WHATSAPP_API_KEY` (**defined but unused outside env.ts**); `EMAIL_SMTP_HOST/PORT/USER/PASSWORD`, `EMAIL_FROM_ADDRESS`; `EMAIL_MSG91_AUTH_KEY/DOMAIN/TEMPLATE_ID/OTP_VARIABLE/EXPIRY_VARIABLE`; `OTP_DELIVERY_CHANNEL` (sms|email, default sms); `OTP_PEPPER`.
- gitops `applications/common/base/configmap.yaml`: providers `mock`, `OTP_DELIVERY_CHANNEL=email (SMS is no longer a channel)`.
- gitops `environments/dev/configmap-patch.yaml`: `EMAIL_PROVIDER=msg91`, `OTP_DELIVERY_CHANNEL=email`, `EMAIL_MSG91_DOMAIN/TEMPLATE_ID/OTP_VARIABLE`, `EMAIL_FROM_ADDRESS`. `prod` and `uat` overlays set no provider keys.
- gitops `applications/common/base/secret.yaml` key names: `OTP_PEPPER`, `SESSION_SECRET`, `SMS_API_KEY` (empty), `WHATSAPP_API_KEY` (empty), `EMAIL_SMTP_HOST/USER/PASSWORD`, `EMAIL_MSG91_AUTH_KEY`, plus DB, Redis, storage and Razorpay keys.
- **Security:** `secret.yaml` holds plaintext values (including OTP_PEPPER, the SMTP password and the MSG91 auth key) in git. Values are deliberately not reproduced here. Treat them as exposed and rotate.

## Observability and admin UI

- Logging only: `lib/logger` in the mock adapter and the webhook. No metrics library, no delivery dashboards.
- Admin UI: template manager only. No delivery-history or failed-send view.
