# Email sender identities

Source of truth: `packages/domain/src/modules/notifications/senders.ts`. Business
code never names a sender or reply address.

## From (by sender role)

The template key's family (the part before the first dot) selects the role.

| Family | Role | Default From | Env key override |
|---|---|---|---|
| `auth` | verification | `verification@abies.in` | `ABIES_SENDER_VERIFICATION` |
| `appointment` | appointments | `appointments-notify@abies.in` | `ABIES_SENDER_APPOINTMENTS` |
| `order` | orders | `orders-notify@abies.in` | `ABIES_SENDER_ORDERS` |
| `payment`, `refund` | billing | `billing-notify@abies.in` | `ABIES_SENDER_BILLING` |
| anything else | notifications | `notifications@abies.in` | `ABIES_SENDER_NOTIFICATIONS` |

The brief's default for unlisted families is no-reply. The code uses the
`notifications` role instead, because `no-reply` is not a sender role in
`senders.ts`. Changing that is a decision for the owner of the sender list.

## Reply-To (by family)

| Family | Reply-To |
|---|---|
| `auth` | `support@abies.in` |
| `notifications` | `support@abies.in` |
| `appointment` / `appointments` | `care@abies.in` |
| `order` / `orders` | `orders@abies.in` |
| `payment`, `refund`, `billing` | `accounts@abies.in` |
| `partner` / `partners` | `partners@abies.in` |
| anything else | `support@abies.in` |

Reply-To is not configurable by env. Changing it means a code change in
`senders.ts`.

## Sender state

`EMAIL_SENDER_STATES` is a JSON object keyed by sender role, for example
`{"verification":"VERIFIED","orders":"VERIFIED"}`. Values are `PENDING`,
`VERIFIED` or `DISABLED`.

- A role not listed is `PENDING`. The default, when the variable is unset, is
  every role `PENDING`.
- A send from any role that is not `VERIFIED` is refused as a permanent
  failure, before anything is sent.
- If the JSON cannot be parsed, or contains an unknown state, every role is
  treated as `DISABLED`. The setting fails closed.

Set a role to `VERIFIED` only after its domain and DNS records are confirmed
with the email provider (see `EMAIL-MAILER91-SMTP.md`).
