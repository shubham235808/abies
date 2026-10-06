# Email templates

Source: `packages/domain/src/modules/notifications/email-templates.ts`.

## Catalogue

Each template has a subject, an HTML body and a plain-text body. Placeholders
use `{{name}}` syntax.

| Key | Required variables |
|---|---|
| `auth.otp_code` | `name`, `otp`, `expiryMinutes` |
| `appointment.confirmed` | `name`, `appointmentRef`, `appointmentDateTime` |
| `appointment.cancelled` | `name`, `appointmentRef`, `appointmentDateTime` |
| `order.confirmed` | `name`, `orderNumber` |
| `order.shipped` | `name`, `orderNumber`, `trackingNumber` |
| `order.delivered` | `name`, `orderNumber` |
| `payment.success` | `name`, `amount`, `reference` |
| `refund.completed` | `name`, `amount`, `reference` |
| `support.ticket.created` | `name`, `ticketId` |
| `diagnostic.report_available` | `name` |

`auth.otp_code` keeps the code out of the subject line. The code appears in
both bodies.

## Rules

- **Escaping.** Every value substituted into the HTML body is HTML-escaped
  (`& < > " '`). Literal template text is authored in the catalogue and is
  not escaped again. The plain-text body and the subject take values raw.
- **Header safety.** A subject value containing CR or LF is refused.
- **Missing values.** Every required variable is checked before anything is
  rendered. A missing or empty value raises `MISSING_VARIABLE`, which the
  adapter reports as a permanent failure. The output never contains
  `undefined`. The error names the variable, never its value.
- **Declared placeholders.** A unit test checks that every placeholder used by
  a template is declared as required.
- **Shared layout.** One layout function gives every HTML body the same
  branding and footer. The text body has the same footer. The footer contains
  `support@abies.in`.

## Diagnostic reports

`diagnostic.report_available` says only that a report is available in the
account and asks the customer to sign in. It takes no clinical variable, and
no result, finding or measurement can be passed into it. Keep it that way:
any future diagnostic email must follow the same rule.

## Adapter variables

The adapter builds variables from the payload's string and number values.
`name` falls back to the recipient's name, then to `there`. For
`auth.otp_code`, `expiryMinutes` is derived from `expiresInSeconds` when it is
not passed directly.
