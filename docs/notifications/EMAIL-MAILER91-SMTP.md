# Mailer91 SMTP settings

The adapter sends through Mailer91's SMTP relay with nodemailer. Every
setting below is fixed in code, except where the operator supplies a value
through config. No credential value is written in this repository.

## Transport

| Setting | Value | Source |
|---|---|---|
| Host | `smtp.mailer91.com` | Preset default; override with `EMAIL_SMTP_HOST` |
| Port | `587` | `EMAIL_SMTP_PORT` (default 587) |
| Implicit TLS (`secure`) | `false` | Fixed |
| `requireTLS` (STARTTLS) | `true` | Fixed. A server without STARTTLS fails permanently |
| Certificate validation (`rejectUnauthorized`) | `true` | Fixed. Never disabled |
| Minimum TLS version | TLS 1.2 | Fixed |
| Auth user | `emailer@abies.in` | `SMTP_USERNAME` |
| Auth password | secret | `EMAIL_SMTP_PASSWORD` |
| `connectionTimeout` | 10 s | Fixed |
| `greetingTimeout` | 10 s | Fixed |
| `socketTimeout` | 15 s | Fixed |
| Pooling (`pool`) | off | Fixed. Each send opens and closes its own connection |

## Required keys

- `EMAIL_PROVIDER=mailer91`
- `SMTP_USERNAME`
- `EMAIL_SMTP_PASSWORD` (secret)

If any required key is missing, the send fails permanently with
`BLOCKED_EXTERNAL_CONFIGURATION` and the message names the missing keys.
Nothing is attempted.

## Error mapping

See `EMAIL-SECURITY.md` for the full table. In short: SMTP 4xx and network
or timeout errors are retryable; SMTP 5xx, 535 authentication failures and
STARTTLS or certificate failures are permanent.

## Before go-live: confirm with Mailer91

The settings above are the intended contract. Confirm each of these against
Mailer91's current documentation before enabling `EMAIL_PROVIDER=mailer91` in
production:

- The SMTP host, port, and whether STARTTLS on 587 is the supported mode.
- That `emailer@abies.in` is the correct SMTP username for the account, and
  how Mailer91 expects the password to be issued and rotated.
- Whether Mailer91 requires an explicit sender domain verification, and the
  DNS records (SPF, DKIM, DMARC) for `abies.in` that it expects.
- The rate limits and daily caps for the account.
- Whether Mailer91 returns a usable message id for `providerRef`.
- Any restriction on the From and Reply-To domains.

Until these are confirmed, keep every sender in `EMAIL_SENDER_STATES` at
`PENDING`, or leave `EMAIL_PROVIDER` at `mock`.
