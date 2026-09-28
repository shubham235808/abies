# Enterprise Current State

ENTERPRISE-0 deliverable (1 of 5). Snapshot as of 2026-09-28, grounded in a
direct read of `prisma/schema.prisma` (1614 lines, full), `src/server/rbac.ts`
(full), `src/modules/doctors/doctors.service.ts` (full),
`src/modules/medicines/catalogue.service.ts` and `orders.service.ts` (full),
`next.config.mjs` (full), `src/proxy.ts` (full), `prisma/seed.ts` (partial),
and every one of `docs/CURRENT-STATE.md`, `docs/IMPLEMENTATION-STATUS.md`
(1217 lines, all 12 phases), `docs/DOMAIN-MODEL.md`, `docs/TARGET-ARCHITECTURE.md`,
`docs/SECURITY-MODEL.md`, `docs/PORTAL-UX-SPEC.md`, `docs/UI-UX-AUDIT.md`,
`docs/UI-REDESIGN-PLAN.md`, `docs/UX-12-QA-REPORT.md` — plus direct authorship
of every UX-1 through UX-12 portal rebuild referenced below (this session and
the one immediately prior).

**Tooling note**: a transient outage in this session's Bash/Agent tooling
prevented a final mechanical `find`-based file-count pass (exact route/
component/test file counts). Nothing below is guessed to compensate — every
claim here is backed by a file this session actually read in full, or by
first-hand authorship. Where a number would otherwise be useful (e.g. "exactly
N route handlers"), it's omitted rather than estimated. This does not affect
the accuracy of what follows, only its exhaustiveness on pure file-count
trivia.

## 1. What ABIES already is

Twelve backend phases (`docs/IMPLEMENTATION-PLAN.md`) shipped and verified
end-to-end — real Postgres, real Docker deployment, real Playwright
walkthroughs per phase, `vitest` at 103/103 as of Phase 12. On top of that, a
full UX redesign (`docs/UI-REDESIGN-PLAN.md`, stages UX-0 through UX-12,
committed `8ed9ac7`/`f6226d1`/`97a7362`/`c9d7c7f`) rebuilt every portal
dashboard from generic template + "Coming Soon" placeholders into role-
specific, data-driven views, verified live at three viewports (174
screenshots, `docs/UX-12-QA-REPORT.md`).

This is **not** a greenfield prototype. It is a mature modular monolith with:
- 10 portals + public site, all backed by real Prisma models and real RBAC.
- A real payment layer (Razorpay adapter, webhook-verified, never client-
  trusted) wired through appointments, diagnostics, medicine orders, and
  Panchakarma bookings.
- A real audit log, read and written, with an admin-facing viewer.
- A real object-storage abstraction (MinIO/S3, signed URLs only).
- A real, if minimal, notification model (`Notification` row per event,
  `IN_APP` fully functional, SMS/EMAIL/WHATSAPP adapters stubbed behind a
  hard-disabled-in-production dev mock).
- A real rate-limiting layer (`src/proxy.ts`, Redis-backed) and a real CSP/
  HSTS header set (`next.config.mjs`).

The enterprise brief's job is therefore **extension and reshaping**, not
reconstruction, for most of its asks — with a genuinely new subsystem needed
for a specific minority (promotions, GST/tax/invoicing, physical POS,
location/language ranking, database-driven configuration). Both are true at
once; `docs/ENTERPRISE-GAP-ANALYSIS.md` draws that line item by item.

## 2. Data model — what actually exists (ground truth from `prisma/schema.prisma`)

Organized by domain, not by migration order. Every model listed here is live
in the current schema, not aspirational.

**Identity & access**: `User` (10-role enum: PATIENT, DOCTOR, ADMIN, LAB,
PHARMACY, PANCHAKARMA_CENTRE, CUSTOMER_SUPPORT, TECH_SUPPORT, SALES,
CARE_COORDINATOR), `StaffProfile` (department + generic `organizationId`
string, unused by any current query), `Session`, `OtpChallenge`,
`ConsentArtifact`/`ConsentRecord`, `AuditEvent`.

**Patients**: `PatientProfile` (single `preferredLanguage` string, default
"English" — no additional-languages array; `address`/`city`/`state`/`pin` as
plain strings, no lat/long, no structured serviceability radius),
`FamilyMember`.

**Doctors**: `DoctorProfile` (`specialties`/`languages` are both plain
`String[]`, `consultationModes` enum array, `videoFee`/`clinicFee` as plain
`Int`, no ranking/scoring fields, `rating`/`reviewCount` present but nothing
ever writes to them — no review system exists), `DoctorDocument` (3-state
status: PENDING/VERIFIED/REJECTED — no UNDER_REVIEW/EXPIRED/
RESUBMISSION_REQUIRED as distinct states), `DoctorClinic` (has `latitude`/
`longitude`, nullable, unused by any query today), `DoctorAvailability`,
`DoctorVerificationAction`.

**Appointments/payments/notifications**: `AppointmentSlot`, `Appointment`,
`Payment` (5-value purpose enum, plain `Int` amount — no tax/GST fields
anywhere on this model), `Notification` (5-channel enum) — **no
`NotificationPreference` model exists** despite being named in
`docs/DOMAIN-MODEL.md` §13; nothing lets a patient opt out of a channel today.

**Consultations & clinical record**: `Consultation`, `AssessmentTemplateField`
(the one existing precedent for admin-configurable-without-a-migration
content — seeded, not hardcoded, exactly the pattern
§2/§55's configuration platform should generalize), `ClinicalNote`,
`VideoSession` (closed one-value provider enum, no real vendor connected),
`Prescription`/`PrescriptionItem`.

**Care Plan Engine**: `CarePlan`, `CarePlanItem` — the central cross-module
orchestration layer every "follow-up"/"at risk" feature across Patient,
Doctor, and Care Coordinator already reads from.

**Diagnostics**: `DiagnosticLab`, `DiagnosticTest` (lab-owned, no
platform-wide catalogue), **no `DiagnosticPackage` model** —
`testId`/`packageId` were left nullable on recommendations/order-items
specifically so a package concept could land later without a schema change,
but it never has; every order line is one test today.
`DiagnosticRecommendation`, `DiagnosticOrder`, `DiagnosticOrderItem`,
`SampleCollection`, `DiagnosticReport`.

**Reports**: `Report` — generic document envelope, `kind` enum includes
`UPLOADED_HISTORICAL` but no UI exists for a patient to actually upload one;
only auto-populated from a released `DiagnosticReport` today.

**Medicines & pharmacy**: `Medicine` (platform-wide, lazily built via
find-by-name-or-create; **no `category`, no HSN, no tax fields, single
`imageUrl` string — no multi-image support**), `Pharmacy`,
`PharmacyInventory` (batch + expiry + quantity + price — **`quantityAvailable`
is directly incremented/decremented by order and inventory-edit code with no
movement/ledger row written anywhere**, confirmed by reading both
`catalogue.service.ts`'s `updateInventory` and `orders.service.ts`'s
`restockItems`/`bookOrder`), `MedicineOrder` (online-order shaped only — the
schema and every service function assume a Razorpay-paid order; **there is no
physical/counter-sale concept anywhere in the schema**), `MedicineOrderItem`,
`Shipment` (**`carrier` is a free-text string typed by the pharmacy user, not
a `CourierProvider` enum or config table** — confirmed in
`orders.service.ts`'s `dispatchOrder`).

**Panchakarma**: `PanchakarmaCentre`, `Therapy` (centre-owned, single
`description` string, no images field, no photos array), `Therapist` (name +
qualifications only — **no document/verification subsystem, no
languages/gender/availability fields**, unlike `DoctorDocument`'s full
upload-and-review flow), `PanchakarmaRecommendation`, `PanchakarmaBooking`,
`PanchakarmaSession`.

**Payments**: `Payment`, `Refund` — no `Fee`/`Commission`/`Payout`/
`Settlement`/`Reconciliation` (explicitly scoped out per Phase 11's own
documented decision).

**Support/Sales/Care Coordination CRM**: `SupportTicket` (8-category, 4-
priority, 6-status, department-scoped to the existing `StaffDepartment`
enum), `SupportMessage`, `SupportAttachment`, `PartnerLead` (7-stage pipeline,
CRM-tracking-only — doesn't gate real partner verification, which lives in
each partner module's own `verificationStatus`).

**Nothing resembling** any of the following exists anywhere in the schema:
`Promotion`/`PromotionPlacement`/`PromotionAudience`/`PromotionSchedule`,
any Location/serviceability model beyond plain address strings, any
`TaxSettings`/`Invoice`/`GSTConfig`, any `StockMovement`/`InventoryMovement`,
any `CourierProvider` config table, any `NotificationPreference`, any
`DocumentRequirement`/`VerificationRule` config table, any fine-grained
permission string (RBAC is role-only — see §4 below), any physical-POS/
`Sale`/`Bill` model, any `Brand`/`Manufacturer` join table (Medicine's
manufacturer/brand are plain strings), any `TherapyPackage`.

## 3. Portal-by-portal UI state (post UX-1..12, this session + prior)

Every portal below already has a role-specific dashboard (not a shared
template) — this is the single biggest thing the brief's §83 acceptance
criteria and Finding 1 of `docs/UI-UX-AUDIT.md` originally flagged, and it's
now closed:

- **Public site** (`src/app/(public)/*`): homepage with Services/How-it-works/
  Partner sections, live doctor search (`/doctors`, `/doctors/[slug]`), public
  medicines/diagnostics/panchakarma catalogue pages, `/partners` with accurate
  self-onboarding copy, `/support`, `/contact`, `/privacy`, `/terms`
  (real `ConsentArtifact` rows, not fabricated legal text).
- **Patient** (`src/app/patient/*`): dashboard shows real next-appointment,
  care-plan progress fraction, diagnostics/medicine/Panchakarma status cards,
  built from `listMineAsPatient`-style queries across 5 modules — no
  hardcoded "Coming Soon". Nav: Dashboard/Appointments/Care Plans/
  Diagnostics/Medicines/Panchakarma/Reports/Support/Profile/Family. **Header
  still shows the patient's mobile number, not their name** (portal-shell.tsx
  top bar) even though the dashboard body itself does say "Welcome, Asha
  Rao" — the brief's §57 identity fix is partially done (body) and not done
  (header/topbar), and applies identically to all 10 other portal shells.
- **Doctor**: pre-approval verification view + post-approval operational
  dashboard (next patient, today's schedule, tasks requiring attention
  computed from unfinalized notes/draft prescriptions), full clinical
  workspace at `/doctor/consultations/[id]` (assessment, notes, prescription,
  diagnostic/Panchakarma recommendation, care plan creation).
- **Admin**: real operations dashboard (`getDashboardMetrics()` — live
  `groupBy`/`count` queries, no fake numbers), unified verification queues
  per partner type, staff provisioning, refunds queue (MFA-gated), audit log
  reader with real filters.
- **Lab**: dashboard bucketed into Today's Collections/Pending Samples/
  Processing/Reports Pending/Completed Today/Test Catalogue, critical-result
  alert banner, order detail shows patient name.
- **Pharmacy**: dashboard bucketed into New Orders/To Pack/Ready to Dispatch/
  In Transit/Low Stock/Expiring Soon — **online-order-only**, no POS, no GST,
  no invoice.
- **Panchakarma Centre**: dashboard bucketed into Today's Sessions/Upcoming/
  Awaiting Scheduling/Active Courses/Completed; booking detail has a visual
  session-progress indicator (`ProgressSteps` component).
- **Customer Support / Technical Support**: shared `SupportQueueView`
  component, tabbed (Unassigned/My Tickets/P1/P2/Awaiting Customer/Resolved
  Today) — but **the two portals are still functionally identical** beyond
  copy; Technical Support has no incident-specific fields (request ID,
  browser, module) because none exist in the schema — this is a standing,
  explicitly-flagged gap from `docs/UI-REDESIGN-PLAN.md`, not new.
- **Sales**: Kanban pipeline by `PartnerLead.stage`, lead detail with an
  `AuditEvent`-sourced stage-history timeline.
- **Care Coordinator**: merged dashboard — clinical-concern tickets first,
  other tickets, then `listAtRiskItems()`'s at-risk care-plan queue, with a
  working "Open ticket for this patient" action.

## 4. Authorization model (ground truth from `src/server/rbac.ts`, full read)

`requireSession()` (cookie → `Session` row, Redis-cached, sliding rotation),
`requireRole(ctx, ...roles)` (role-only — no permission-string concept),
`requireAdminMfa(ctx)` (role=ADMIN + `mfaVerified`). **There is no
`requirePermission()` helper and no permission-string vocabulary anywhere in
the codebase** — every route handler that needs finer-grained control than
"any of these N roles" implements it ad hoc in the service layer (e.g.
`ownedByPharmacy()` in `orders.service.ts`, `documentForOwner()` in
`doctors.service.ts`). This is real, working, server-enforced authorization —
just coarser than the brief's §56 `pharmacy.product.create`-style permission
strings.

## 5. Component library (`src/components/ui/`, `src/components/layouts/`)

Ten shared UI primitives exist today: `Button`, `Input`/`Textarea`/`Select`/
`Label`/`FieldError`, `Card`, `Badge` (incl. per-domain status badge
variants), `Alert`, `MetricCard`, `EmptyState`, `Tabs`, `ProgressSteps`,
`ListRow`. Layout: `PortalShell` (role+MFA gate, sidebar/mobile-nav),
`MobileNav` (dropdown, replaces the old horizontal-scroll strip),
`SiteHeader`/`SiteFooter`.

**Not built**: `DataTable` (every list in every portal is a hand-rolled
`.map()` over `ListRow`/`Card`, no sort/filter/pagination/column-config
framework), `Timeline`/`ActivityFeed` (Sales' lead-history timeline is
bespoke inline JSX, not a reusable component), `DocumentViewer`,
`FileUploader`/`ImageUploader` (upload exists per-module as raw
`<input type="file">` + `FormData`, no shared component),
`InvoiceViewer`, `PaymentCard`, `OrderTimeline`, `Modal`/`Drawer`/
`ConfirmationDialog` (no modal primitive exists at all — every confirmation
in the app today is an inline button state change, not a dialog), `Toast`,
`NotificationCentre`, `SearchBar`/`FilterBar` (search inputs are per-page,
not a shared component), `Breadcrumb`.

## 6. Security & infra posture (ground truth from `next.config.mjs`, `src/proxy.ts`)

CSP (no-nonce recipe, Razorpay origins allowlisted), HSTS, standard security
headers — all real, verified live per `docs/SECURITY-REVIEW.md`.
`Permissions-Policy: camera=(), microphone=(), geolocation=()` — **browser
geolocation is currently hard-blocked at the HTTP header level**, directly
relevant to the brief's §3 "geolocation may optionally be used with explicit
patient permission": that optional capability cannot work until this header
changes, which is itself a deliberate security decision to revisit, not an
oversight.

Rate limiting (`src/proxy.ts`, Redis-backed) is scoped to exactly three
routes today: OTP request, support-ticket creation, payment webhook — an
IP+path allowlist, not a general gateway. `x-request-id` is generated and
attached to every request/response — a real building block for the brief's
§45 technical-incident correlation-ID ask, though nothing currently persists
it against a stored incident record.

## 7. Testing

`vitest run`: 103/103 passing as of the Phase 12 close (stable across
repeated runs per `docs/IMPLEMENTATION-STATUS.md`). Integration tests exist
per-module under `tests/integration/` (auth, consent, patients, doctors,
appointments, consultations, care-plans, diagnostics, medicines, panchakarma,
support/sales — one file roughly per phase). `tests/e2e/smoke.spec.ts` is the
one committed Playwright spec; every phase's live walkthrough since has used
a throwaway spec file (written to `tests/e2e/` for the run, deleted
afterward) rather than growing a permanent E2E suite — a real, repeatedly-
used verification discipline, but not a standing regression safety net for
future phases.
