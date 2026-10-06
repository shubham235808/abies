# Email channel: current state

Status as of the email channel work (expansion-5). Scope: the code in
`packages/domain/src/lib/notifications/` and `packages/domain/src/modules/notifications/`.

## What exists

- **SMTP adapter** (`lib/notifications/smtp-adapter.ts`): nodemailer transport, STARTTLS on port 587, certificate validation on, timeouts and pooling set as in `EMAIL-MAILER91-SMTP.md`. Used for `EMAIL_PROVIDER=mailer91`, and for the generic `EMAIL_PROVIDER=smtp` (which needs `EMAIL_SMTP_HOST`).
- **Config** (`lib/notifications/email-config.ts`): `validateEmailConfig()` returns ok or the missing key names; sender-state parsing; strict single-address parsing.
- **Sender identities** (`modules/notifications/senders.ts`): From addresses per sender family, and Reply-To per template family. See `EMAIL-SENDER-IDENTITIES.md`.
- **Templates** (`modules/notifications/email-templates.ts`): ten email templates with subject, HTML and text bodies. See `EMAIL-TEMPLATES.md`.
- **Routing into the adapter**: `getAdapter('EMAIL')` in `lib/notifications/index.ts` returns the SMTP adapter for `mailer91` and `smtp`. The `mock` provider is unchanged.

## Current behaviour

- Default `EMAIL_PROVIDER` is `mock`. Nothing is sent over SMTP unless an operator sets `mailer91`.
- Default sender states are all `PENDING`. With no `EMAIL_SENDER_STATES`, every email send is refused as permanent until an operator marks a sender `VERIFIED`.
- Missing SMTP settings return a permanent `BLOCKED_EXTERNAL_CONFIGURATION` result that names the missing keys. Nothing is attempted.
- The OTP email (`auth.otp_code`) renders from the shared template, and the code appears in the body but not in the subject or any error.

## Not yet done

- The Mailer91 requirements (host, port, auth method, sender domain verification, DKIM/SPF records) are not yet confirmed against Mailer91's current documentation. This must happen before go-live.
- No live send has been made. All automated tests mock nodemailer.
- The `EMAIL_FROM_ADDRESS` key is still in the env schema for the legacy `smtp` path, but the sender identity now comes from `senders.ts`.
- A `no-reply` identity is not a sender role. Unlisted template families use the `notifications` sender.
- Delivery status callbacks (bounce and complaint handling) are not implemented.
- Template wording is English only. The Hindi WhatsApp and IN_APP copy in `templates.ts` has no email equivalent yet.
