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

## Staff and profile APIs

All routes below require the session cookie and same-origin validation for writes. Staff roles are checked against the active database account on every request. Public registration cannot assign a staff role.

| Role | Endpoint | Purpose |
| --- | --- | --- |
| Any account | `GET/PUT /api/profile` | Read/update own name, phone and optional ISO birth date |
| Any account | `POST /api/auth/password` | `{currentPassword,newPassword}`; revoke all sessions |
| Admin | `GET /api/admin/overview` | Operational counts |
| Admin | `GET /api/admin/catalog` | Full catalog, including archived entries |
| Admin | `POST/PUT /api/admin/{products,services,practitioners}[/:id]` | Create/update catalog entries; PUT requires current `version` |
| Admin | `GET /api/admin/users?q=` | Search up to 200 accounts |
| Admin | `PUT /api/admin/users/:id` | `{role,active,version}`; self-access edits blocked |
| Admin | `GET /api/admin/bookings` | Latest 200 scheduled visits; no intake notes |
| Admin | `GET /api/admin/orders` | Latest 200 orders, items and activity |
| Admin | `GET /api/admin/orders/:id/prescription` | Order-linked prescription download or notes |
| Admin | `POST /api/admin/orders/:id/review` | `{decision:"approved"|"rejected",note,version}` |
| Admin | `POST /api/admin/orders/:id/assign` | `{deliveryUserId,version}`; ready/reviewed orders only |
| Clinician | `GET /api/clinician/bookings/:id` | Assigned patient, shared document metadata and appointment prescriptions |
| Clinician | `GET /api/clinician/bookings/:id/attachment` | Only the document shared with this assigned appointment |
| Clinician | `POST /api/clinician/bookings/:id/complete` | Complete a started, confirmed assigned visit |
| Delivery | `GET /api/delivery/orders` | Assigned deliveries; excludes medicines and clinical data |
| Delivery | `POST /api/delivery/orders/:id/status` | `{status,note,version}`; controlled transitions, reason required for failure |

Bookings accept optional `reason` (max 2,000 characters) and owned `prescriptionId` for sharing with the assigned doctor. Catalog updates use integer paise; services support 30/60 minutes and allowed `modes`; all catalog records have `active` and `version`. Practitioner records link an active clinician with `user_id` or remain unlinked with null. Conflict responses are HTTP 409; clients must refresh stale records. Password hashes and session generations never appear in account responses.
