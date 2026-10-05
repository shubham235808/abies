# CRM — Current State (Phase 0 discovery)

Status: discovery only. No code changed for the CRM. Written 2026-10-05 against branch `main` (commit `1c13e81` on the GitOps repo, `c169912` on the app repo).

## 1. What exists today

### Repository layout
- `apps/client-web` — patient site and sign-in (`/login`, patient only).
- `apps/partner-web` — partner portal: doctor, lab, pharmacy, Panchakarma centre (`/partner/*`). Admin can open it.
- `apps/management-web` — ops portal (`/ops/*`): customer support, care coordination, sales, tech support, admin (`/ops/admin/*`).
- `apps/platform-api` — REST API (`/api/v1/*`), Next.js route handlers.
- `packages/domain` — Prisma schema (83 models) and all business logic under `src/modules/*`.
- `packages/design-system` — shared UI components, portal shell, auth UI.
- `docs/` — architecture, data model, security, decisions (D1–D3 and later), implementation plans.

### Domain modules (`packages/domain/src/modules`)
admin, appointments, audit, auth, care-plans, configuration, consent, consultations, diagnostics, doctors, hospital, medicines, notifications, panchakarma, partners, patients, payments, pharmacies, promotions, reports, reviews, settlement, staff, storage, support, users.

### Authentication
- Mobile OTP sign-in (`auth.service.ts`), sessions in a secure cookie, refresh tokens stored hashed.
- Email-or-mobile sign-in (new): the OTP request resolves an email to its account's mobile. Email sign-in always delivers the code by email.
- Admin requires MFA (`requireAdminMfa`, `mfaEnabled` on the user).
- New-account sign-up asks for a full name (`User.name`, nullable).

### Authorization (RBAC)
- `UserRole` enum: PATIENT, DOCTOR, ADMIN, LAB, PHARMACY, PANCHAKARMA_CENTRE, CUSTOMER_SUPPORT, TECH_SUPPORT, SALES, CARE_COORDINATOR.
- Role checks happen in two places: route handlers (`requireSession`, `requireAdminMfa` in `server/rbac.ts`) and portal layouts (`PortalShell` `allowedRoles`).
- Row-level scoping exists only per owner (e.g. a doctor sees their own appointments). There is no team, region or territory model.
- Portal layouts now let ADMIN into every partner portal page. Partner services still act on the partner's own profile, so an admin account gets empty or failing actions there.

### Leads and sales-adjacent data
- `PartnerLead` (line ~1988 of `schema.prisma`) — an existing lead-like model for partner onboarding. Not a general CRM lead.
- `SUPPORT` — `SupportTicket` model and `modules/support`.
- No `Lead`, `Contact`, `Campaign`, `Opportunity`, `Task`, `FollowUp`, `Activity`, `Segment`, `Tag`, `Pipeline` or `Stage` model exists.

### Customer-facing data the CRM would reference
- Patients: `PatientProfile` (`modules/patients`).
- Doctors: `DoctorProfile` (`modules/doctors`), verification flow in `ops/admin/verification`.
- Appointments and consultations: `modules/appointments`, `modules/consultations`.
- Panchakarma: `modules/panchakarma`.
- Diagnostics: `DiagnosticOrder` and items, `modules/diagnostics`.
- Pharmacy: `MedicineOrder` and items, `modules/pharmacies`, `modules/medicines`.
- Payments: `Payment`, `modules/payments`; settlement in `modules/settlement`.
- Support: `SupportTicket`, `modules/support`.
- Partners: `modules/partners`.

### Consent
- `ConsentArtifact` (versioned, `required`, `active`) and `ConsentRecord` (per user, with IP, user agent and timestamps). Accepted on every sign-in (`verifyOtp`).
- No channel-level preferences (WhatsApp, SMS, email, marketing) yet.

### Audit
- `AuditEvent` model and `recordAuditEvent(ctx, entry)` in `server/audit.ts`. Used for logins, staff creation and admin actions. Free-form `eventType` / `action` strings.
- No before/after diffs and no tamper-evidence beyond database permissions.

### Notifications
- `Notification` model, `notify(userId, channel, templateKey, payload)` in `modules/notifications`.
- Channels: IN_APP (no external send), EMAIL, SMS, WHATSAPP, PUSH (not implemented).
- Adapters (`lib/notifications`): `mock`, `smtp` (abies-dev), `msg91` (email only, `abies_otp` template; enabled in dev once the auth key is in the secret).
- No SMS or WhatsApp provider adapter yet. No campaign or bulk-send machinery.
- `NotificationTemplate` model exists.

### Storage
- S3-compatible storage via MinIO (`lib/storage.ts`). Private by default with signed reads.
- Public catalogue images are served through `/api/v1/catalogue/images/*` (only the `catalogue/` prefix).

### Business settings
- `configuration` module and `GstRateConfig`; promotions module.

### Platform / infrastructure
- Kubernetes: RKE2 with namespaces `abies-dev`, `abies-ci`, `abies-gateway`, `argocd`, `envoy-gateway-system`.
- GitOps: `abies-gitops` repo, ArgoCD app `abies-dev` (automated sync). `abies-prod` manual sync.
- CI: Tekton Pipelines (`build-and-deploy`, `build-migrator`), kaniko builds to Harbor, `update-gitops-image` commits image digests back to GitOps.
- Triggers: Tekton Triggers installed; EventListener and triggers in `tekton/triggers/`. Webhook hostname `ci-hooks.abies.in` (needs DNS and the Gitea webhook).
- Gateway API: `abies-internal-gateway` (VIP `192.168.3.116` via HAProxy), external gateway for DMZ.
- Data: Postgres (Prisma migrations, `prisma migrate deploy` as an ArgoCD PreSync hook), Redis, MinIO.
- Observability: structured logger (`lib/logger`), `x-request-id` correlation. No metrics stack confirmed in the repo.

### Event model
- No event bus or transactional outbox. Cross-module effects are direct service calls and `notify()`.

## 2. Reusable as-is
| Need | Reuse |
|---|---|
| Sign-in and sessions | `auth`, `server/session`, `server/rbac` |
| Admin MFA | `requireAdminMfa` |
| Audit | `AuditEvent`, `recordAuditEvent` |
| Consent gate | `ConsentArtifact`, `ConsentRecord` |
| Notifications | `notify()`, `Notification`, `NotificationTemplate`, adapters |
| Portal UI and layouts | `PortalShell`, design system |
| Customer references | `PatientProfile`, `DoctorProfile`, `Payment`, orders, `SupportTicket` |
| Storage | `lib/storage.ts` |
| Deployment | GitOps + Tekton + ArgoCD |

## 3. Gaps (must be built)
1. CRM data model: Lead, Contact, Opportunity, Task, FollowUp, Activity, Note, Tag, Pipeline/Stage, Assignment, Campaign, Segment, Communication, Conversion, Import/Export jobs.
2. Roles: CRM roles do not exist in `UserRole`. Needs a decision (see the plan).
3. Row-level scope: no team, region or territory model.
4. Communications: no SMS or WhatsApp adapter; email exists only for OTP. No template-based campaign sending. No channel consent preferences.
5. Event/outbox: none. Needed for timelines and automation.
6. Import/export with preview, validation, duplicate detection and audit: none.
7. Automation engine: none.
8. Tests for the CRM: none yet.
9. CRM docs (the `docs/CRM-*.md` set): none yet.

## 4. Risks noticed during discovery
- Admin accounts can open partner pages but their partner actions fail. Any CRM access that reuses the same pattern would have the same problem.
- Notifications send mail synchronously inside requests; a slow provider delays the request (the MSG91 adapter now has a 10 s timeout).
- `PartnerLead` and a future CRM `Lead` could drift apart. Decide the relationship before adding the CRM lead model.
- Clinical data must stay out of CRM views by default. Existing patient and doctor records are in their own modules, so the CRM should reference them, not copy them.
