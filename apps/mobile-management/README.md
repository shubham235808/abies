# ABIES Ops (apps/mobile-management)

Flutter app for ABIES operations staff — the Management app from the
mobile-architecture spec. Same architecture as `apps/mobile` (Riverpod,
go_router, Dio + cookie-jar session on the `abies_session` cookie, `AppEnv`
flavors, ABIES brand theme copied verbatim).

## Scope (MVP)

- **Auth:** password sign-in (mobile or email), forgot password, first-time
  password setup for accounts with no password yet, and the ADMIN MFA step.
  No self-registration and no OTP sign-up. Staff accounts are always created by an
  administrator, matching `apps/management-web/src/app/ops/login/page.tsx`.
- **Support ticket queue:** the agent's department queue from
  `GET /api/v1/support/tickets/queue`, with open/SLA-breached/mine counts and
  the web queue's tabs.
- **Ticket detail:** thread, reply, claim, change status (only the
  transitions the backend accepts), and triage (department/priority).
- **Reply attachments:** one PDF/JPG/PNG (max 10 MB, checked on the device
  before upload) per reply. The reply goes to `POST .../messages` and the
  file then goes to `POST .../attachments` (multipart), linked to the new
  message. A file has to come with a message. File names and sizes are
  listed, but files can't be opened because no backend route serves them.
- **Refund requests:** for `CUSTOMER_SUPPORT` and `ADMIN` only, the roles
  `POST /api/v1/refunds` admits. The ticket shows the linked patient's
  refundable payments, and an agent can request a refund of up to the
  remaining balance. This only creates a request. Approving or rejecting it
  needs `settlement.manage` plus MFA (ADMIN/SUPER_ADMIN/FINANCE), and that
  stays on the web `/ops/refunds` queue.

Allowed roles: `CUSTOMER_SUPPORT`, `TECH_SUPPORT`, `SALES`, `CARE_COORDINATOR`,
`ADMIN`. These are the roles the queue route admits. Any other account is
signed out with an explanation.

## Not included yet

- Customer-360. Support's version (`getCustomerSummary`) is only rendered
  server-side by management-web and has no JSON route. The CRM one,
  `GET /api/v1/crm/customers/:id`, is CRM access, which the support roles
  don't have.
- Refund approval/rejection. See above.
- Opening or downloading attachments, because no route serves them.
- Logging a ticket on behalf of a caller.
- CRM leads. The CRM write routes call `assertSameOrigin`, which requires a
  browser `Origin` header that a native client never sends.
- Push notifications.
- Sentry observability (`NoopObservability` only).

## Run / verify

    flutter run --dart-define=ABIES_ENV=dev -t lib/main_dev.dart
    flutter analyze
    flutter test
