# Notifications: Gap Analysis (Phase 0)

Status key: **EXISTS** (usable as-is), **PARTIAL** (present but incomplete or wrong), **MISSING**.
Phase labels are proposed (no brief file in repo); confirm against the brief. P1 provider and channel abstraction with delivery state; P2 templates; P3 queue, retry, dead letter, idempotency; P4 webhooks; P5 consent and preferences; P6 OTP; P7 RBAC, admin UI, observability, secrets.

| # | Requirement | Current state | Status | Fixed in |
|---|---|---|---|---|
| 1 | Provider abstraction | `NotificationAdapter` interface and `getAdapter()` switch exist. Real adapters: SMTP and MSG91 (email only). | PARTIAL | P1 |
| 2 | Channel abstraction | Channel enum and `notify()` cover all five channels. SMS, WhatsApp and push have no adapter. | PARTIAL | P1 |
| 3 | Templates | `NotificationTemplate` CRUD and admin UI exist. Send path never reads them. Rendering is hard-coded for OTP only. | PARTIAL | P2 |
| 4 | History and delivery state | `Notification` row with status, providerRef, error, sentAt. Only one status transition per send. No READ handling (`readAt` never written). No delivery receipts. | PARTIAL | P1 (state), P4 (receipts) |
| 5 | Webhooks with validation | Razorpay webhook with HMAC check and rate limit. No provider receipt webhooks for SMS, email or WhatsApp. No event-id dedupe. | PARTIAL | P4 |
| 6 | Retry with backoff | None. `notify()` is one inline attempt. MSG91 has a 10s timeout and no retry. | MISSING | P3 |
| 7 | Dead letters | None. FAILED is terminal with no attempts count or re-drive path. | MISSING | P3 |
| 8 | Queue or outbox | None. `bullmq` is declared but unused. `notify()` runs after the business write, not in its transaction, so a crash can lose a message. | MISSING | P3 |
| 9 | Idempotency | Only CRM automation (`@@unique([ruleId, leadId])`) and Razorpay finalizers. `notify()` has no dedupe key, so a retry would double-send. | MISSING | P3 |
| 10 | Consent | Legal consent artifacts and records exist and are auto-accepted at login. Not connected to any send decision. | PARTIAL | P5 |
| 11 | Preferences and opt-out | None. `consentPreferences` Json is unused by sending. No unsubscribe, quiet hours or per-channel setting. | MISSING | P5 |
| 12 | OTP handling | HMAC-hashed codes, TTL, cooldown, attempt cap, rate limit. Email delivery works in dev only (msg91). SMS delivery is a no-op, and prod inherits `OTP_DELIVERY_CHANNEL=sms`. The plaintext OTP is persisted in `Notification.payload`. | PARTIAL | P6 |
| 13 | RBAC | Session, role, permission and admin MFA helpers exist. No notification permission and no notification API. | PARTIAL | P7 |
| 14 | Secrets | Env schema and configmap/secret keys exist for every provider. Three `*_API_KEY` vars are unused. Secret values are committed in plaintext in gitops `secret.yaml`. | PARTIAL | P7 (urgent, see below) |
| 15 | Observability | Logger calls only. No metrics, no delivery dashboard, no failed-send alert. | MISSING | P7 |
| 16 | Admin UI | Template manager only. No delivery history, failed-send queue or resend. | PARTIAL | P7 |
| 17 | SMS provider | Mock only. Mock marks rows SENT. | MISSING | P1 (blocked by decision A) |
| 18 | WhatsApp provider | Mock only. | MISSING | P1 (blocked by decision B) |
| 19 | Push provider | Enum value exists. Rows are written FAILED. | MISSING | P1 (blocked by decision E) |

## Top five gaps

1. **No delivery pipeline.** Sends are inline and single-attempt. There is no outbox, retry, dead letter or idempotency key, and `bullmq` is installed but unused.
2. **SMS and WhatsApp are not real.** Mock returns ok and the row shows SENT. SMS OTP is a silent no-op, and the default for prod is `sms`.
3. **Templates are not used at send time.** The admin table is decorative, and rendering is hard-coded.
4. **No consent-aware preferences or opt-out.** Nothing stops a message to a user who opted out, which matters for CRM campaigns.
5. **Security: OTP and secrets exposure.** The plaintext OTP is written to `Notification.payload`. Plaintext SMTP, MSG91 and OTP_PEPPER values are committed in gitops `secret.yaml`. Rotate and move them to an external secret store.

## Decisions needed before implementation

- **A. SMS provider and DLT.** Choose a provider. Transactional SMS in India needs TRAI DLT entity and template registration (sender ID and each template text) before any send. Who registers, and how long does approval take?
- **B. WhatsApp provider.** Choose the BSP (for example Meta Cloud API or a BSP). Needs an approved template set and a business account. `WHATSAPP_API_KEY` is only a placeholder.
- **C. Sender addresses.** Confirm the prod `EMAIL_FROM_ADDRESS` and the sending domain. Dev uses `no-reply@abies.in` with MSG91 domain `abies.in`. SPF, DKIM and DMARC for that domain must be verified.
- **D. Prod OTP channel.** Choose `sms` or `email` for abies-prod. This is blocked on A, and the answer decides whether prod login works at all.
- **E. Push.** Confirm whether a native app exists and which push service (FCM or APNs) to use. Otherwise drop PUSH from scope.
- **F. Marketing vs transactional.** Which CRM messages need opt-in, and how opt-out is captured.
- **G. Retention.** How long `Notification.payload` is kept. OTP values must never be stored.
