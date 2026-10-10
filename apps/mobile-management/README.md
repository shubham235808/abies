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

Allowed roles: `CUSTOMER_SUPPORT`, `TECH_SUPPORT`, `SALES`, `CARE_COORDINATOR`,
`ADMIN`. These are the roles the queue route admits. Any other account is
signed out with an explanation.

## Not included yet

- Refund requests from a ticket, and the customer-360 view.
- Attachments.
- Logging a ticket on behalf of a caller.
- CRM leads. The CRM write routes proxy to the DB service and require a
  browser `Origin` header.
- Push notifications.
- Sentry observability (`NoopObservability` only).

## Run / verify

    flutter run --dart-define=ABIES_ENV=dev -t lib/main_dev.dart
    flutter analyze
    flutter test
