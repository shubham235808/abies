# Enterprise Gap Analysis

ENTERPRISE-0 deliverable (2 of 5). Every numbered capability from the
enterprise brief, classified per its own six-way taxonomy, with evidence
from `docs/ENTERPRISE-CURRENT-STATE.md`. "Evidence" cites a specific file/
model/finding, not a guess. Where a section's asks split across categories,
each sub-item is classified separately rather than picking one label for the
whole section.

Legend: **REUSABLE** / **UI_REDESIGN** / **BACKEND_EXT** / **NEW** /
**CONFIG** / **COMPLIANCE**.

## §2 — Enterprise configuration principle

Every named example (ads/banners, featured doctors/medicines/packages,
serviceable locations, languages, specialties, consultation modes, medicine
categories, HSN/tax, diagnostic packages/tests, therapies, therapist
onboarding, centre hours, document requirements, verification requirements,
payment methods, courier providers, notification templates, support
categories, ticket priorities, app settings) is **CONFIG**.

Concretely: `specialties`/`languages` on `DoctorProfile` are plain
`String[]` with no backing lookup table — a specialty exists only by being
typed once and appearing in a doctor's array; the public search's `facets()`
function derives its filter options from whatever strings happen to already
be in use, not from a canonical list. `SupportTicketCategory`,
`SupportTicketPriority`, `MedicineOrderStatus`, and every other status/
category concept in the app is a Prisma **enum**, not a database row — adding
one requires a migration + code deploy today, which is exactly what §2
prohibits. The one existing counter-example, `AssessmentTemplateField`
(admin-configurable, DB-seeded, no migration needed to add a field), is the
template this whole configuration platform should generalize from — it is
real, working precedent, not a hypothetical.

## §3 — Location engine

**NEW** (core engine) + **BACKEND_EXT** (integration into existing search).
`PatientProfile.address/city/state/pin` and `DoctorClinic.city/state/
postalCode/latitude/longitude` exist as plain fields (see
ENTERPRISE-CURRENT-STATE §2), but there is no serviceability-radius concept,
no PIN-code-to-service-area mapping, and no "Services near: 201301 Noida"
UI anywhere. Doctor search's `city` filter (`doctors.service.ts`
`searchPublic`) is a case-insensitive substring match on `DoctorClinic.city`
— a real filter, not a location engine. `latitude`/`longitude` exist on
`DoctorClinic` but nothing reads them. Geolocation is currently impossible
regardless of consent, since `Permissions-Policy: geolocation=()` blocks it
at the HTTP layer (**COMPLIANCE/security-decision-to-revisit**, not a build
task by itself).

## §4 — Language matching engine

**BACKEND_EXT**. `DoctorProfile.languages` (String[]) and
`PatientProfile.preferredLanguage` (single string, no additional-languages
array) both exist. The intersection/ranking algorithm itself does not:
`searchPublic`'s current `orderBy` is `[rating desc, yearsExperience desc,
createdAt asc]` — no language-match, location-match, or multi-factor ranking
exists at all. Adding `PatientProfile.additionalLanguages: String[]` is a
small additive migration; the ranking function is new logic over existing
fields, not a new subsystem.

## §5 — Promotion & advertisement engine

**NEW**, entirely. No `Promotion`/`PromotionPlacement`/`PromotionAudience`/
`PromotionSchedule` model or anything resembling one exists in
`prisma/schema.prisma`. This is the largest single net-new schema surface in
the whole brief.

## §6-8 — Patient portal, dashboard, dashboard sections 1-6

Nav/structure: **UI_REDESIGN** (remove "Reports" as a top-level tab, fold
into Diagnostics/Appointments — small, mechanical, already-established
pattern from UX-3). Section 1 (immediate healthcare): **REUSABLE** — this is
exactly what UX-3 already built (`src/app/patient/page.tsx`), verified live.
Section 2 (Find Doctors on dashboard): **UI_REDESIGN** + depends on §3/§4
**BACKEND_EXT** for real ranking; the doctor cards themselves
(photo/name/specialties/languages/fee/next-availability) are mostly
**REUSABLE** field-for-field from `publicDoctor()`'s existing shape, minus a
photo (no doctor-photo field exists — **NEW**, small: add
`DoctorProfile.photoUrl` or a `DoctorDocument` of type `PROFILE_PHOTO`
surfaced publicly, which already exists as an enum value but is never
exposed). Section 3 (Panchakarma near you) and Section 4 (Diagnostics near
you): same shape as Section 2 — **BACKEND_EXT** for location filtering,
**UI_REDESIGN** for the cards, blocked on §3's location engine for the
"near you" framing specifically (a plain city-list fallback is **REUSABLE**
today without it). Section 5 (ABIES Medicines): **REUSABLE** — `searchPublic`
in `catalogue.service.ts` already does this. Section 6 (Promotions): **NEW**,
depends entirely on §5.

## §9 — Doctor discovery (full marketplace page)

**UI_REDESIGN** + **BACKEND_EXT**. The `/doctors` page and its filters
already exist and work (city/specialty/language/mode, URL-query-driven
already — confirmed in `searchPublic`'s query shape). What's missing:
fee-range filter (**BACKEND_EXT**, small — `videoFee`/`clinicFee` already
exist as plain `Int`, just needs a range clause), and the ranking algorithm
from §4 (**BACKEND_EXT**, shared with §4/§8).

## §10 — Diagnostics marketplace

**NEW** for packages specifically — confirmed no `DiagnosticPackage` model
exists (see ENTERPRISE-CURRENT-STATE §2); every current order line is one
`DiagnosticTest`. **UI_REDESIGN** for the landing sections (Recommended/
Popular/Nearby/Home Collection/My Orders) over what data already exists.
**BACKEND_EXT** for "Nearby Labs" (depends on §3).

## §11 — Diagnostic order tracking, courier providers

**UI_REDESIGN** for the order-detail timeline (data already exists:
`DiagnosticOrderStatus`'s 6-state machine, `SampleCollection`,
`DiagnosticReport`). **NEW**, small: `CourierProvider` as a config-backed
enum/table — today `Shipment.carrier` (used by the parallel Medicines flow,
not Diagnostics, which has no shipment concept at all since diagnostics
doesn't ship anything physical) is a free-text string a pharmacy user types
by hand, confirmed in `orders.service.ts`'s `dispatchOrder`.

## §12 — Patient medicines & pharmacy (patient-facing)

**REUSABLE**, substantially. `listFinalizedPrescriptionsForPatient`,
`matchPrescriptionAtPharmacy` (per-item availability-before-commit, exactly
what §12 describes), OTC catalogue browsing, prescription-requirement
server-side enforcement (`bookOrder` refuses an unresolved
prescription-required item) — all already real and correct, confirmed by
full read of `orders.service.ts`. **UI_REDESIGN** for presentation
(categories, richer medicine-detail page). **NEW**: medicine `category`
field doesn't exist on `Medicine` (name/genericName/form/strength/
manufacturer/brand/imageUrl only).

## §13 — Patient payments

**NEW** (the page itself) over **REUSABLE** data. No `/patient/payments` page
exists today — patients see order/booking status per-module but never a
consolidated financial view. Every underlying field the brief asks for
already exists on `Payment` (date, gateway ids, amount, status) and
`Refund` — this is a pure UI/query aggregation task, not a schema change,
same shape as Admin's existing `getDashboardMetrics()`. No PDF receipt/
invoice generation exists anywhere (**NEW**, shared with §32).

## §14-18 — Doctor portal, documents, consultation workspace, diagnostic/Panchakarma prescribing

**REUSABLE**, almost entirely — this is the most complete portal in the
app. Clinical workspace (§16), diagnostic recommendation (§17,
`DiagnosticRecommendation` + the doctor-writes/patient-reads flow), and
Panchakarma recommendation (§18, `PanchakarmaRecommendation`, same shape)
are all real, tested, and verified live per Phases 5/7/9. Documents (§15):
**UI_REDESIGN** for richer status badges — the brief wants 7 states
(NOT_UPLOADED/UPLOADED/UNDER_REVIEW/VERIFIED/REJECTED/EXPIRED/
RESUBMISSION_REQUIRED), the schema has 3 (`DoctorDocumentStatus`:
PENDING/VERIFIED/REJECTED) — **BACKEND_EXT**, additive enum change, not a
rebuild (D3 precedent already documented this exact simplification as
deliberate in `docs/DOMAIN-MODEL.md`, so expanding it is a considered
reversal, not a bug fix). Doctor never verifying their own documents and
admin-only approval: already true today (`admin-doctors.service.ts`).

## §19-24 — Diagnostic Lab portal

**REUSABLE**, substantially — Phase 7 built this as a complete
recommendation→booking→collection→processing→release pipeline, and UX-6
already rebuilt the dashboard into real buckets. §21 (test catalogue
management incl. packages): test-only is **REUSABLE**, packages are **NEW**
(shared with §10's `DiagnosticPackage` gap). §23 (report release, doctor
acknowledgement of critical results): **REUSABLE**, already built
(`criticalFlag`/`doctorAcknowledgedAt` on `DiagnosticReport`, surfaced on the
lab dashboard's critical-alert banner per UX-6).

## §25-34 — Pharmacy enterprise system (POS/GST/inventory/invoicing)

This section is where the brief's ask diverges most sharply from what
exists. Breaking it down:
- §25 nav/shell, §26 product management, §28 inventory dashboard cards:
  **UI_REDESIGN** over **REUSABLE** data for the online-fulfilment half;
  product fields beyond what `Medicine`/`PharmacyInventory` already carry
  (SKU, barcode, HSN, reorder level, multi-image, storage requirements) are
  **NEW**, additive fields.
- §27 batch-aware inventory with movement records: **partially REUSABLE**
  (batch/expiry/quantity tracking exists) + **NEW** (no `StockMovement`
  model — confirmed by reading both places `quantityAvailable` is mutated;
  neither writes a ledger row).
- §29-30 physical POS, cash/UPI/card recording: **NEW**, entirely — no
  counter-sale concept exists in the schema at all; every `MedicineOrder`
  today assumes online Razorpay checkout (`bookOrder` throws if payments
  aren't configured).
- §31-32 GST/tax engine, invoice generation: **NEW**, entirely — zero tax
  fields exist anywhere (`Payment.amount`/`Medicine`/`PharmacyInventory` are
  all plain, tax-unaware `Int`s). This is the single largest, most
  regulation-sensitive gap in the brief and should be treated as
  **COMPLIANCE** as well as **NEW** — §72's own text says "do not invent
  legal rules in code... document compliance assumptions for business/legal
  review," which applies directly to GST/HSN/CGST/SGST/IGST logic.
- §33 online order dashboard: **REUSABLE** — UX-7 already built this
  (New/To Pack/Ready/Dispatched buckets).
- §34 financial dashboard: **NEW** for the aggregation itself (no
  Payment-method or online-vs-physical split exists since physical sales
  don't exist yet), but the *pattern* to build it with is **REUSABLE** —
  identical shape to Admin's already-working `getDashboardMetrics()`.

## §35-40 — Panchakarma Centre portal

**REUSABLE**, substantially — UX-8 already rebuilt the dashboard into real
buckets (Today's Sessions/Upcoming/Awaiting Scheduling/Active Courses/
Completed), and the underlying scheduling/session/attendance model (§39) is
real and conflict-safe (`@@unique([bookingId, sessionNumber])`). Gaps:
§36 multi-photo therapies (`Therapy` has no images field — **NEW**, small),
§37-38 therapist onboarding + document verification (`Therapist` has no
document/verification subsystem at all, unlike `DoctorDocument`'s full
flow — **NEW**, moderate: this is effectively "build `DoctorDocument`'s
shape a second time for `Therapist`," a known, already-proven pattern to
replicate, not a novel design problem). §40 dashboard cards not yet built
(Therapists Available today, Doctor Consultations today): **BACKEND_EXT**,
small — same data, different bucket, same pattern as the rest of UX-8.

## §41-45 — Support portals (Customer, Technical)

**REUSABLE** for Customer Support (Phase 10 + UX-9 already built a real
ticket queue, tabs, SLA classification, refund-from-ticket flow). **Customer
360 view (§42)**: **NEW** as a dedicated page — the data it needs
(appointments/orders/bookings/payments/tickets per patient) all exists and
is queryable, but no single "open this patient" aggregation view exists
today; this is a pure read-aggregation build, same shape as §13's Patient
Payments page. **Technical Support differentiation (§44-45)**: **NEW**
schema fields required for the specific incident-detail asks (module,
correlation ID persisted against a ticket, browser/device, API endpoint,
integration name, error classification) — none of these exist on
`SupportTicket` today; this is the standing gap `docs/UI-REDESIGN-PLAN.md`
already flagged and explicitly declined to fabricate. `x-request-id` (see
ENTERPRISE-CURRENT-STATE §6) is a real, already-generated building block for
the correlation-ID piece specifically, once something persists it.

## §46-48 — Sales / Partner Operations

**REUSABLE**, substantially — Phase 10 + UX-10 already built the lead
pipeline, Kanban view, and an `AuditEvent`-sourced stage-history timeline.
Gaps: pipeline stage list differs (`PartnerLeadStage` has 7 values: LEAD/
QUALIFIED/VERIFICATION/COMMERCIAL/ENABLEMENT/ACTIVATED/REJECTED; brief wants
9: NEW/CONTACTED/QUALIFIED/DOCUMENTATION/VERIFICATION/COMMERCIAL/
ENABLEMENT/ACTIVATED/LOST — **BACKEND_EXT**, an enum-value decision to make,
not a rebuild). §48 dashboard cards (overdue follow-ups, activated-this-month):
**BACKEND_EXT**, small, same data already on `PartnerLead`.

## §49-50 — Care Coordinator

**REUSABLE**, substantially — UX-11 already merged the at-risk queue onto
the main dashboard with a working "open ticket" action, exactly matching
§50's described patient-view shape. Explicit guardrail (§50: care
coordinator cannot change prescriptions/diagnosis/clinical notes) is already
true by construction — the Care Coordinator role has no write path to
`ClinicalNote`/`Prescription`/`CarePlanItem`'s clinical fields anywhere in
the codebase (only `patientMarkedDoneAt`-style fulfilment fields are
patient/coordinator-writable, per the Care Plan Engine's documented clinical/
fulfilment separation).

## §51-56 — Administrator portal

§51 nav groups, §52 dashboard, §53 verification centre: **REUSABLE**,
substantially — Phase 11 already built a real live-metrics dashboard and a
per-partner-type verification queue pattern (doctors/labs/pharmacies/
panchakarma-centres), though not yet unified into one tabbed "Verification
Centre" (**UI_REDESIGN** to consolidate four existing separate queue pages
into one tabbed view) and not yet extended to therapists (**NEW**, depends
on §38). §54 promotion manager: **NEW**, entirely, depends on §5. §55
configuration centre: **NEW**, entirely, depends on §2 — this is the biggest
single admin-side build in the brief. §56 granular permissions: **BACKEND_EXT**
— RBAC is real and server-enforced today (confirmed, `src/server/rbac.ts`),
just role-only; adding a permission-string layer is additive to, not a
replacement of, the existing `requireRole`/`requireAdminMfa` gates.

## §57 — User identity in headers

**UI_REDESIGN**, small and mechanical. The dashboard *body* already shows
real names in several portals (Patient's "Welcome, Asha Rao", built in
UX-3) — the portal-shell top bar across all 11 portals still shows the raw
mobile number (confirmed by direct review of the live app this session and
last). This is a one-component fix (`PortalShell`'s header) that
immediately applies everywhere, not 11 separate page changes.

## §58 — Notification centre

**BACKEND_EXT** for preferences (`NotificationPreference` doesn't exist —
**NEW**, small, additive model, already anticipated in
`docs/DOMAIN-MODEL.md` §13 but never built). **REUSABLE** for the delivery
model itself (`Notification` row, `IN_APP` fully working) — extending to a
real SMS/email/WhatsApp provider is **COMPLIANCE/ops-blocked**, not a code
gap: the adapter interface already exists and is provider-agnostic
(`docs/IMPLEMENTATION-STATUS.md` Phase 4), it has simply never had real
credentials to connect to, unchanged status since Phase 4.

## §59 — Global search

**NEW**, entirely, as a cross-entity search. Individual list-filtering
already exists per-portal (doctors, orders, tickets, leads all have their
own filtered queries) but nothing spans entity types in one search box.

## §60-66 — Design system, components, tables, dashboards, financial data, audit, media

§60 brand/design: **REUSABLE** — the palette, tone, and "avoid Ayurveda
clichés" direction are already how the whole redesign was built (confirmed:
`ENTERPRISE-CURRENT-STATE.md`'s component list uses exactly this palette,
`docs/TARGET-ARCHITECTURE.md`'s own design-system section states the same
principle, unchanged since Phase 0). §61 component library: mixed — 10 of
~30 named components exist (see ENTERPRISE-CURRENT-STATE §5); the rest
(`DataTable`, `Modal`/`Drawer`/`ConfirmationDialog`, `Toast`,
`FileUploader`, `Timeline`, `InvoiceViewer`, etc.) are **NEW**. §62 table
standard: **NEW** — no list in the app today has sort/filter/pagination as a
reusable framework; every list is a bespoke `.map()`. §63 dashboard
standard ("cards must link to filtered views, not dead ends"): **REUSABLE**
as a principle — every `MetricCard` built across UX-1..12 already links to
a filtered list page (confirmed by this session's own UX-7/8 pharmacy/
panchakarma work); this is already the house style, just needs to be named
explicitly as a standard so it doesn't regress. §64 financial data
server-side authority: **REUSABLE** as a principle (Admin's dashboard and
every payment-status transition already computes server-side, never
trusting a client total) — extends naturally once GST/POS (§31-34) exist.
§65 audit: **REUSABLE**, substantially — the audit log already covers
verification, prescriptions, refunds, role-adjacent actions; extending
coverage to inventory adjustments and invoice cancellation is
**BACKEND_EXT**, additive, once those actions exist. §66 media abstraction:
**REUSABLE** — `src/lib/storage.ts`'s signed-URL-only pattern already covers
every private-document case in the brief; it just needs to be reused for
new entities (therapist documents, promotion images) rather than rebuilt.

## §67-69 — URL state, responsive, accessibility

**REUSABLE**. Filter state is already URL-driven where it exists (doctor
search's city/specialty/language/mode, the admin verification queues'
`?status=`, the support queues' `?tab=` built this session) — this is
already the established pattern, not a gap. Responsive: three-viewport
verification (390/768/1440) is now the standing practice per
`docs/UX-12-QA-REPORT.md`; §68's 375px width specifically hasn't been
separately checked (**UI_REDESIGN**, small verification task, not a
rebuild). Accessibility: a lightweight spot-check happened in UX-12 (labels,
focus states, contrast); a full WCAG AA pass with a real screen-reader/
keyboard-only walkthrough has not (**UI_REDESIGN**, verification task).

## §70-72 — Security, healthcare privacy, medicine compliance

§70 security: **REUSABLE** — every listed protection (auth, OTP, session,
MFA, RBAC, ownership checks, consent, audit, rate limiting, security
headers) is real and already verified per `docs/SECURITY-REVIEW.md`; nothing
in this brief should weaken any of it, and nothing proposed here requires
weakening it. §71 least-privilege data access: **REUSABLE** as an existing
principle (Support's ticket view already excludes clinical notes; Care
Coordinator already has no clinical write path — see §49-50 above) —
extending it to new views (Customer 360, Technical incidents) is a
constraint to design against, not a gap to close. §72 medicine compliance:
**COMPLIANCE**, explicitly — `Medicine.requiresPrescription` exists and is
enforced server-side today (real, not cosmetic), but dispensing-status
tracking, sale-restriction rules, and pharmacy-license-to-product
association do not exist and should not be invented without real
pharmaceutical/Ayurvedic regulatory input, per the brief's own instruction.

## §73-77 — Order architecture, status management, reporting, no-fake-data, empty states

**REUSABLE**, entirely, as existing and correct patterns. §73 (don't force
distinct workflows into one generic Order table): already true —
`DiagnosticOrder`/`MedicineOrder`/`PanchakarmaBooking`/`Appointment` are
deliberately separate models, exactly as §73 asks; this is not a gap, it's
already-correct architecture the brief happens to also recommend. §74
(centralized status definitions): partially true — every status is a real
Prisma enum with a documented state machine (`docs/DOMAIN-MODEL.md`'s "State
machines" section), but there's no single UI-mapping layer (label/meaning/
variant per status) — **BACKEND_EXT**, small, mostly organizational. §75
reporting: **REUSABLE** pattern (Admin/Lab/Pharmacy dashboards already
aggregate real data live), extends per-role as each role's own dashboard
data grows. §76-77 no-fake-data / empty states: **REUSABLE** — this has been
a standing, repeatedly-enforced discipline across all 12 backend phases and
the entire UX redesign (every dashboard rebuilt this session and last uses
`EmptyState` with real zero-counts, never invented numbers) — not a gap,
the strongest-held existing practice in the codebase.

## Summary table

| Area | Dominant classification |
|---|---|
| Configuration platform (§2, §55) | CONFIG / NEW |
| Location engine (§3) | NEW |
| Language matching (§4) | BACKEND_EXT |
| Promotions (§5, §54) | NEW |
| Patient portal (§6-13) | REUSABLE + UI_REDESIGN, with NEW pockets (payments page, packages) |
| Doctor portal (§14-18) | REUSABLE |
| Lab portal (§19-24) | REUSABLE, NEW for packages |
| Pharmacy enterprise (§25-34) | NEW (POS/GST/invoicing), REUSABLE (online fulfilment) |
| Panchakarma Centre (§35-40) | REUSABLE, NEW for therapist documents |
| Support portals (§41-45) | REUSABLE (Customer), NEW (Technical incident fields) |
| Sales (§46-48) | REUSABLE |
| Care Coordinator (§49-50) | REUSABLE |
| Admin (§51-56) | REUSABLE + NEW (promotions, config), BACKEND_EXT (permissions) |
| Identity/header (§57) | UI_REDESIGN, small |
| Notifications (§58) | BACKEND_EXT + COMPLIANCE (real providers) |
| Global search (§59) | NEW |
| Components/tables (§60-64) | mixed, ~1/3 REUSABLE, ~2/3 NEW |
| Audit/media (§65-66) | REUSABLE |
| URL state/responsive/a11y (§67-69) | REUSABLE, verification gaps only |
| Security/privacy/compliance (§70-72) | REUSABLE, with GST/medicine rules COMPLIANCE |
| Architecture/reporting/no-fake-data (§73-77) | REUSABLE — already-correct existing practice |
