# API contract

All routes are under `/api`. JSON errors are `{ "error": "message" }`. Money is integer INR paise. IDs for user-owned records are UUIDs. Mutation requests require `Origin` matching `APP_ORIGIN`; authentication uses the `abies_session` HttpOnly cookie. No public clinician signup or role escalation route exists.

| Method | Path                                           | Purpose                                                                 |
| ------ | ---------------------------------------------- | ----------------------------------------------------------------------- |
| GET    | `/health/live`, `/health/ready`                | Process / dependency health                                             |
| POST   | `/auth/register`                               | `{name,email,password}` → public account and session cookie             |
| POST   | `/auth/login`                                  | `{email,password}` → account and session cookie                         |
| POST   | `/auth/logout`                                 | Revoke session and clear cookie                                         |
| GET    | `/auth/me`                                     | Signed-in public account                                                |
| GET    | `/catalog`                                     | Services, practitioners, products; Redis cache 60 seconds               |
| GET    | `/slots?practitionerId=ananya&date=YYYY-MM-DD` | Available ISO UTC timestamps                                            |
| POST   | `/bookings`                                    | `{serviceId,practitionerId,startsAt,mode,address?}`                     |
| GET    | `/bookings`                                    | Current patient's appointment history                                   |
| POST   | `/bookings/:id/cancel`                         | Cancel an owned, future confirmed booking                               |
| POST   | `/prescriptions/upload`                        | Multipart `file`, PDF/PNG/JPEG, ≤5 MB                                   |
| GET    | `/prescriptions`                               | Owned prescription metadata and clinician notes                         |
| GET    | `/prescriptions/:id/file`                      | Owner-only attachment download                                          |
| GET    | `/clinician/bookings`                          | Assigned practitioner's patients; clinician only                        |
| POST   | `/clinician/prescriptions`                     | `{bookingId,notes}`; assigned clinician only                            |
| POST   | `/orders`                                      | `{items:[{productId,quantity}],address,prescriptionId?,idempotencyKey}` |
| GET    | `/orders`                                      | Owned orders with line-item snapshots                                   |

Checkout accepts quantities 1–10, rejects duplicate product lines, locks product rows in sorted order, and recalculates totals from the database. Retries with the same user and idempotency key return the original order without reserving stock again. Reuse a key only for a retry of the same intended order. No payment or fulfillment endpoint exists.

Successful creates return 201 (registration returns 200 with its session). Validation errors return 400, authentication 401, authorization/origin errors 403, missing owned resources 404, duplicate email/slot or insufficient inventory 409, rate limits 429, and unavailable dependencies 503. Error bodies do not expose SQL, file contents or credentials.
