# Email security notes

## Secrets

- `EMAIL_SMTP_PASSWORD` is the only secret for SMTP. It is read from the
  environment, passed only to the transport options, and never logged.
- No credential value appears in code, docs, tests or fixtures. Tests use a
  sentinel string.
- Errors never carry the password, the OTP or the raw nodemailer message.
  The returned error is `SMTP send failed (<code> <smtp-code>)` or a fixed
  configuration message. Only the nodemailer code and the numeric SMTP reply
  code are copied, and the code is restricted to uppercase letters, digits and
  underscores.

## Transport

- STARTTLS is required. A server that does not offer it fails with
  `ETLS`, which is permanent.
- Certificate validation is on. `rejectUnauthorized: false` is never used.
- TLS 1.2 is the minimum.
- Timeouts bound every stage: connection 10 s, greeting 10 s, socket 15 s.

## Header injection

Every address that reaches a header (To, From, Reply-To) passes
`parseSingleAddress()` first. It rejects:

- CR and LF,
- commas and any list,
- display names and angle brackets,
- anything that is not a plain `local@domain` form.

A rejected address is a permanent failure. Nothing is sent.

## Sender control

- Default sender state is `PENDING` for every role, so nothing sends until an
  operator verifies a sender.
- A non-`VERIFIED` sender is refused before the transport is created.
- An unreadable `EMAIL_SENDER_STATES` disables every role.

## Error classification

| Condition | Result |
|---|---|
| Missing SMTP config | Permanent, `BLOCKED_EXTERNAL_CONFIGURATION`, no send |
| Bad or missing recipient, invalid sender or reply address | Permanent |
| Sender not VERIFIED | Permanent |
| Missing or empty template variable, unknown template | Permanent |
| SMTP 4xx | Retryable |
| SMTP 5xx | Permanent |
| SMTP 535 / `EAUTH` | Permanent |
| `ETLS`, `EREQUIRETLS`, certificate errors | Permanent |
| `ETIMEDOUT`, `ECONNECTION`, `ECONNRESET`, DNS errors | Retryable |
| Anything else | Retryable (the notification pipeline's default) |

## Operational rules

- Rotate `EMAIL_SMTP_PASSWORD` through the secret store. Follow
  `docs/security/SECRET-ROTATION-CHECKLIST.md`.
- Do not paste the password into tickets, chat or logs when debugging. Check
  the SMTP username and the key name instead.
- Keep `EMAIL_PROVIDER=mock` in any environment without a verified sender.
