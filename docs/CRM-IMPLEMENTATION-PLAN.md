# CRM — Implementation Plan (Phase 0 output)

Companion to `docs/CRM-CURRENT-STATE.md`. Nothing here is built yet. Phase 1 starts only after the decisions in section 2 are made.

## 1. Proposed sequence

Follows the phases in the CRM spec, adjusted to what the repo already has.

| Phase | Scope | Depends on |
|---|---|---|
| 0 — Discovery | `CRM-CURRENT-STATE.md`, this plan | done (plan pending your review) |
| 1 — Foundation | CRM data model (leads, contacts, activities, notes, tags, assignments), CRM roles, CRM navigation in `management-web`, lead CRUD, assignment, audit wiring | decisions D1–D4 |
| 2 — Sales | Pipeline stages (configurable), Kanban and table views, opportunities, tasks and follow-ups, sales dashboard | Phase 1 |
| 3 — Customer 360 | Read-only references to patients, appointments, Panchakarma, diagnostics, orders, payments summary, support summary; unified timeline | Phase 2; D5 |
| 4 — Communications | Email (via existing `notify` and MSG91), then SMS and WhatsApp adapters; approved templates; delivery status; consent checks | Phase 1; D6 |
| 5 — Marketing | Campaigns, UTM capture, segments, conversion attribution, ROI | Phase 4; D7 |
| 6 — Automation | Declarative rules (assignment, follow-up, escalation), in-app notifications | Phase 2, event layer (see 3.4) |
| 7 — Enterprise controls | Row-level visibility, controlled import/export, custom fields, duplicate merge workflow | Phase 1 |
| 8 — Production | Helm/Kustomize, ArgoCD app, Tekton build, NetworkPolicy, secrets, backups, monitoring | each phase |

Each phase ships behind a migration, RBAC tests and audit tests before the next one starts.

## 2. Decisions needed from you

These change the design, so I won't guess.

**D1 — CRM roles.** `UserRole` has no CRM roles. Options:
- (a) Add a small set now: `CRM_ADMIN`, `SALES_MANAGER`, `SALES_AGENT`, `MARKETING`, `AUDITOR`. Reuse `SALES` and `CUSTOMER_SUPPORT` where they fit.
- (b) Keep the existing roles and use permission flags on the user instead of new enum values.
- (c) Take the full role list from the spec (SUPER_ADMIN, MANAGEMENT, FINANCE_MANAGER, etc.).

My recommendation: (a). It's a small enum migration and keeps the RBAC checks simple.

**D2 — Row-level scope.** There's no team or region model. Choose:
- (a) Start with "own records" for agents and "all records" for managers and admins, and add teams later.
- (b) Add a `CrmTeam` and region model now.

Recommendation: (a), then (b) in Phase 7.

**D3 — Leads and `PartnerLead`.** Keep `PartnerLead` for partner onboarding and build `CrmLead` for prospects. Or fold partner leads into the CRM. Recommendation: keep them separate and link them where a partner is the subject.

**D4 — Pipeline stages.** The spec's default stages (NEW → CONTACTED → QUALIFIED → PROPOSAL → FOLLOW_UP → CONVERTED, plus LOST, DUPLICATE, INVALID, DO_NOT_CONTACT) are fine as defaults. Confirm them, and confirm that administrators can rename or add stages.

**D5 — Patient data in the CRM.** The spec allows CRM users to see summaries only, and clinical records stay out of the CRM. Confirm which summary fields a sales agent and a support agent may see: for example, appointment dates and status, but not diagnoses or prescriptions.

**D6 — Communication providers.** MSG91 is wired for email. For SMS and WhatsApp, confirm the provider and whether WhatsApp templates are already approved with it. Without an approved template, WhatsApp sends can't start.

**D7 — Marketing sends.** Bulk marketing sends need consent records per channel, and the spec asks for consent checks. Confirm the legal basis you rely on for marketing messages, since it decides which contacts can be messaged.

## 3. Architecture decisions I'd take unless you object

### 3.1 Placement
- CRM domain code lives in `packages/domain/src/modules/crm/`, next to the other modules.
- CRM screens live in `apps/management-web/src/app/ops/crm/`, using the existing `PortalShell` and design system.
- CRM APIs live in `apps/platform-api/src/app/api/v1/crm/`, following the existing route handler pattern.
- No separate CRM login. Existing sessions and roles apply.

### 3.2 Data model
- New tables use a `Crm` prefix (`CrmLead`, `CrmActivity`, `CrmTask`, `CrmOpportunity`, and so on).
- References to patients, doctors, orders, payments and tickets are foreign keys or IDs, never copied fields.
- Every table gets `createdAt`, `updatedAt`, `createdById`, and an index on the fields the list screens filter by.

### 3.3 Authorization
- Every CRM service function takes the caller's `RequestContext` and checks role and scope before it reads or writes.
- No authorization in the UI alone. Route handlers call the same checks.
- Negative tests for each role before a screen ships.

### 3.4 Events
- No event bus exists, so I'd add a transactional outbox table (`CrmOutboxEvent`) written in the same transaction as the change, drained by a worker. This keeps timelines and automation consistent without new infrastructure.
- A `crm-worker` runs as a separate Deployment in `abies-dev`, using the platform-api image with a different command.

### 3.5 Audit
- Use `recordAuditEvent` for every create, update, assignment, stage change, export and permission change.
- Store before and after values for the changed fields, as JSON on the audit metadata.

### 3.6 Notifications
- Email and later SMS/WhatsApp go through `notify()` and the adapters. CRM adds a `CrmCommunication` row that records each send, its provider reference and its status.
- Marketing sends check consent before they queue.

### 3.7 Kubernetes and GitOps
- Phase 8 only: a `crm` overlay in `abies-gitops` with its own ServiceAccount, NetworkPolicy and resource limits. Phases 1–7 run in the existing `abies-dev` namespace.
- No separate cluster.

## 4. Infrastructure changes

Phase 1 needs no new infrastructure. Phase 4 needs:
- SMS and WhatsApp credentials as secrets in `abies-gitops` (same process as the MSG91 key).
- An approved WhatsApp template list in MSG91 or the chosen provider.

Phase 8 needs the `crm` overlay and NetworkPolicy described in 3.7.

## 5. Database changes

- Phase 1: `CrmLead`, `CrmActivity`, `CrmNote`, `CrmTag`, `CrmEntityTag`, `CrmAssignment`, `CrmOutboxEvent`, and the role enum change from D1. Additive only.
- Later phases add the remaining tables listed in the spec.
- No destructive migrations. Each migration is reviewed before it runs in `abies-dev`.

## 6. Test plan (Phase 1 minimum)

- RBAC: a sales agent can't read another agent's lead; a support agent can't export leads; a patient account can't reach CRM routes.
- Audit: creating, updating, assigning and changing stage each writes an audit event.
- Validation: lead create/update rejects bad mobile, email and PIN formats.
- Duplicate detection: same mobile or email is flagged, not merged.
- Migrations: apply cleanly on an empty database and on the current dev data.

## 7. Risks and blockers

- Decisions D1 to D7 above.
- An admin account opens partner pages but its partner actions fail. CRM screens must not repeat that pattern. Each CRM action checks scope first and returns a clear message.
- Consent and marketing rules (D7) can block the Phase 4–5 scope if the answer is "not permitted".
- WhatsApp needs approved templates before any send.
- `PartnerLead` and `CrmLead` must not drift apart (D3).

## 8. What I'd do next, once D1–D4 are answered

1. Add the Phase 1 models and migration, with the role change from D1.
2. Add the CRM service with RBAC and audit, and the RBAC tests.
3. Add the lead list and detail screens in `management-web`.
4. Deploy to `abies-dev` and check the audit and access rules against the test plan.
