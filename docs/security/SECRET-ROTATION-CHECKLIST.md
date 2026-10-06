# Secret rotation checklist

Status: production deployment is BLOCKED until every item marked COMPROMISED
below is rotated and the new value is stored outside Git.

Do not paste any value into chat, tickets, or commit messages. Do not commit
values to any repository.

## Credentials exposed in plaintext

These values were stored in `applications/common/base/secret.yaml` in the
`abies-gitops` repository, or pasted into chat. Treat each as compromised.

| Secret key | Where it was exposed | Provider or owner | Rotation steps |
|---|---|---|---|
| `EMAIL_MSG91_AUTH_KEY` | GitOps secret file; pasted in chat | MSG91 dashboard, email API | Create a new key in MSG91, update the secret value, revoke the old key |
| `EMAIL_SMTP_PASSWORD` | GitOps secret file | GoDaddy Workspace mailbox `noreply@abies.in` | Change the mailbox password in GoDaddy, update the secret value |
| `OTP_PEPPER` | GitOps secret file | ABIES (internal) | Generate a new random value (`openssl rand -hex 32`). Existing OTP challenges expire within 5 minutes, so this is safe to change |
| `SESSION_SECRET` | GitOps secret file | ABIES (internal) | Generate a new value. Forces every user to sign in again |
| `DATABASE_URL` password (`POSTGRES_PASSWORD`) | GitOps secret file | ABIES (internal) | Change in Postgres and in every consumer at the same time |
| `MINIO_ROOT_PASSWORD`, `STORAGE_SECRET_ACCESS_KEY` | GitOps secret file | ABIES (internal) | Change in MinIO and every consumer |
| `REDIS_URL` (if it carries a password) | GitOps secret file | ABIES (internal) | Change in Redis and every consumer |

## Provider credentials to create (not yet in use)

| Secret key | Purpose | Blocked on |
|---|---|---|
| `SMS_MSG91_AUTH_KEY` | MSG91 SMS | MSG91 account and DLT registration |
| `SMS_MSG91_SENDER_ID` | DLT sender ID | DLT registration |
| `WHATSAPP_MSG91_AUTH_KEY` | MSG91 WhatsApp | MSG91 WhatsApp approval |
| `WHATSAPP_MSG91_INTEGRATED_NUMBER` | WhatsApp number | MSG91 WhatsApp approval |

## Steps after rotation

1. Update each value in the cluster secret store (never in Git).
2. Restart the affected deployments: `platform-api`, `db-service`, `client-web`, `partner-web`, `management-web`.
3. Confirm sign-in still works and that email OTP sends.
4. Revoke the old provider keys and passwords.
5. Record the rotation date and the person who rotated, in the operations log, not in Git.
6. Remove the old values from the git history if the repository is shared, using an approved history rewrite.

## Status

- [ ] EMAIL_MSG91_AUTH_KEY rotated
- [ ] EMAIL_SMTP_PASSWORD rotated
- [ ] OTP_PEPPER rotated
- [ ] SESSION_SECRET rotated
- [ ] Postgres, MinIO and Redis credentials rotated (if they were exposed)
- [ ] Git history cleaned of old values (approved)
- [ ] Production deployment unblocked
