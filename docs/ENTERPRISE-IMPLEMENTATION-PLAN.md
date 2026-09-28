# Enterprise Implementation Plan

ENTERPRISE-0 deliverable (5 of 5). Sequences ENTERPRISE-1 through
ENTERPRISE-15 against the actual current state
(`docs/ENTERPRISE-CURRENT-STATE.md`), the actual gaps
(`docs/ENTERPRISE-GAP-ANALYSIS.md`), and the actual schema changes they
require (`docs/ENTERPRISE-DATA-MODEL-CHANGES.md`). Each stage below is
scoped to what's *actually missing* for that portal, not the brief's full
literal text — most portals need far less work than their section count in
the brief implies, because most of what they ask for already exists.

## Ground rules (carried over from `docs/UI-REDESIGN-PLAN.md`, still binding)

- Validation gate after every stage: `npx tsc --noEmit` → `npx eslint .` →
  `npx vitest run` → `npx next build`, exactly as every one of the 12
  backend phases and the UX-1..12 redesign already did.
- No schema change ships without the reason stated inline in the migration
  (already this codebase's standing convention — every model in
  `prisma/schema.prisma` carries a comment explaining *why* it's shaped the
  way it is, not just what it contains). Follow it for every new model too.
- No fake data, ever, in a screen a real user can reach — `docs/UI-UX-AUDIT.md`
  and every phase since has held this line; nothing in this plan relaxes it.
- Live browser verification per stage (Playwright, throwaway spec, deleted
  after — the established discipline, not a new one), not just `tsc`/lint.
- One reviewable commit per stage or tight group of stages, matching the
  UX redesign's own checkpoint rhythm (`f6226d1`, `97a7362`, `c9d7c7f`).
- Reporting format per stage: **Implemented** / **Database Changes** /
  **API Changes** / **UI Changes** / **Permissions** / **Existing
  Functionality Reused** / **Browser Verification** / **Responsive
  Verification** / **Automated Verification** / **Screenshots Reviewed** /
  **Problems Found** / **Problems Fixed** / **Remaining Gaps** — the brief's
  own §84 format, applied literally, same as UX-1..12's reports were.

## ENTERPRISE-1 — Shared design system

**Scope**: build only what `docs/ENTERPRISE-CURRENT-STATE.md` §5 confirms
doesn't exist yet: `DataTable` (sort/filter/pagination/column-config, one
component reused everywhere a list is currently hand-rolled), `Modal`/
`Drawer`/`ConfirmationDialog`, `Toast`, `FileUploader`/`ImageUploader`
(wrapping the existing `src/lib/storage.ts` upload pattern, not replacing
it), `Timeline` (generalizing Sales' bespoke inline history JSX into a
reusable component), `Breadcrumb`, `SearchBar`/`FilterBar`. Do **not**
rebuild `MetricCard`/`EmptyState`/`Tabs`/`ProgressSteps`/`ListRow` — they
already exist and are already used consistently.
**No schema changes.**

## ENTERPRISE-2 — Configuration platform

**Scope**: `ConfigCategory`, `ServiceLocation`, `DocumentRequirement`,
`CourierProvider`, `NotificationTemplate` (schema per
`docs/ENTERPRISE-DATA-MODEL-CHANGES.md` §1), plus one admin UI section
(`/admin/configuration`, tabbed per config domain) to CRUD them — using the
new `DataTable` from ENTERPRISE-1. Existing enum-based fields
(`specialties`/`languages`/category strings) are **not** migrated to
foreign-key references in this stage — that's a larger, riskier change
deferred to whichever later stage actually needs enforced referential
integrity; this stage just makes the *canonical list* exist and be
admin-editable, with existing free-text fields validated against it
going forward at the point of entry (new doctor signup, new medicine, etc.),
not retroactively rewritten.
**Database changes**: 5 new additive tables.
**This is the prerequisite every later CONFIG-tagged item in
`docs/ENTERPRISE-GAP-ANALYSIS.md` depends on** — sequence it early, not
opportunistically.

## ENTERPRISE-3 — Public website

**Scope**: promotion placements (`PATIENT_HOME_HERO`-style slots, but on
the public homepage first since it has no auth dependency) once
ENTERPRISE-4's `Promotion` model exists — **so this stage's promotion work
actually follows ENTERPRISE-4/13 rather than preceding it**, despite the
brief's own §80 numbering; call out this reordering explicitly rather than
building a public promotion slot against a model that doesn't exist yet.
What *can* ship in this stage standalone: the location chip
("Services near: {pin} {city}") on the public site header, sourced from a
cookie/localStorage pick rather than a patient session (anonymous
visitors have no `PatientProfile` to read from).
**No schema changes** beyond what ENTERPRISE-4 provides.

## ENTERPRISE-4 — Patient portal

**Scope, in dependency order**:
1. Location/language fields (`docs/ENTERPRISE-DATA-MODEL-CHANGES.md` §2) +
   the ranking function in `doctors.service.ts`'s `searchPublic` (language-
   intersection score, then existing rating/experience ordering as
   tiebreakers — never hiding non-matching doctors, per the brief's own
   explicit "do NOT completely hide other doctors" instruction).
2. Dashboard sections 2-4 (Find Doctors/Panchakarma Near You/Diagnostics
   Near You) using that ranking, with an honest unranked fallback if
   location data is missing for a given doctor/patient.
3. `/patient/payments` (pure aggregation, no schema change, can ship
   independently of 1-2).
4. Nav cleanup: remove standalone Reports tab.
5. Promotions section 6 — **after** ENTERPRISE-2's config platform and a
   `Promotion` model exist (see note on ENTERPRISE-3's reordering above).
**Database changes**: `PatientProfile.additionalLanguages`/`latitude`/
`longitude` (additive).
**Existing functionality reused**: dashboard sections 1 and 5 (UX-3's
already-complete "immediate healthcare" cards, `searchPublic`'s existing
medicine catalogue) — untouched.

## ENTERPRISE-5 — Doctor portal

**Scope**: `DoctorDocumentStatus` enum grows from 3 to 7 states (enum-grow,
audit every `switch` over the old 3 for an unhandled case — there are at
minimum `admin-doctors.service.ts`'s document-review action and
`portal-shell`'s badge mapping to check). That's the entire gap; §14-18's
rest is already built.
**No other schema changes.**

## ENTERPRISE-6 — Diagnostic Lab portal

**Scope**: `DiagnosticPackage`/`DiagnosticPackageTest` (per
`docs/ENTERPRISE-DATA-MODEL-CHANGES.md` §6) + the nullable `packageId`
additions to `DiagnosticRecommendation`/`DiagnosticOrderItem`, a "Packages"
tab on the lab's existing test-catalogue page, and package support through
the doctor-recommendation and patient-booking flows this stage touches
across three portals (Lab, Doctor, Patient) — sequence it as one stage
since the package concept is meaningless built in only one of the three.
**Database changes**: 2 new tables + 2 additive nullable columns.

## ENTERPRISE-7 — Pharmacy enterprise system

**The largest stage in this plan** — everything in
`docs/ENTERPRISE-DATA-MODEL-CHANGES.md` §5: `StockMovement` (and the
service-layer pass through every existing inventory-mutation site),
`TaxSettings`, `Medicine.category`/`hsnCode`, `PhysicalSale`/
`PhysicalSaleItem`, `Invoice`, the POS screen, the invoice PDF generator,
the financial dashboard. Recommend splitting this into three internally-
verified checkpoints rather than one giant commit, given its size:
7a (inventory ledger — `StockMovement` retrofit, no new UI surface, pure
correctness/audit work against existing tested code), 7b (POS + GST +
invoicing, the genuinely new subsystem, gated on real GST-rate/legal review
per the COMPLIANCE flag), 7c (financial dashboard, depends on 7a/7b's data
existing).
**This stage should not start until the compliance review named in
`docs/ENTERPRISE-GAP-ANALYSIS.md`'s §25-34 entry has a real answer for the
GST rate table and invoice-format requirements** — building the schema and
UI against placeholder rates is fine for 7a/7c; shipping tax-calculation
logic that computes real customer-facing totals without that review is not.

## ENTERPRISE-8 — Panchakarma Centre

**Scope**: `Therapy.images`, `TherapistDocument`/`Therapist.verificationStatus`/
`Therapist.languages` (per `docs/ENTERPRISE-DATA-MODEL-CHANGES.md` §7) —
direct reuse of the already-proven `DoctorDocument` upload/review pattern,
plus admin-side therapist verification added as a fifth tab to whatever
ENTERPRISE-13's Verification Centre consolidation produces.
**Database changes**: 1 new table + 2 additive columns + 1 additive array
field.

## ENTERPRISE-9 — Customer Support

**Scope**: Customer 360 view (pure read-aggregation, no schema change) —
the one real gap; everything else in §41-43 is already built.

## ENTERPRISE-10 — Technical Support

**Scope**: resolve the `docs/ENTERPRISE-DATA-MODEL-CHANGES.md` §8 decision
(recommend: side-table `TechnicalIncidentDetail`) with the actual product
owner before writing the migration — this is the one place in the whole
plan where a real person needs to make a call before code gets written, not
an engineering judgment call to make unilaterally. Once decided: the
incident-detail fields, a differentiated dashboard (module/integration
breakdown instead of Customer Support's priority/SLA framing), and wiring
`src/proxy.ts`'s existing `x-request-id` through to a ticket's correlation
field when a ticket is filed from an error state.

## ENTERPRISE-11 — Sales / Partner Operations

**Scope**: reconcile `PartnerLeadStage`'s 7 values against the brief's
9-value pipeline (a naming decision, not an architecture change — resolve
it here, don't defer it silently), dashboard cards for overdue/activated-
this-month (small query additions, no schema change).

## ENTERPRISE-12 — Care Coordinator

**Scope**: none required. Verify the existing UX-11 build still satisfies
§49-50 after ENTERPRISE-1's new `Timeline`/`DataTable` components exist, and
adopt them where they'd clean up bespoke code — a refactor-for-consistency
pass, not new functionality.

## ENTERPRISE-13 — Administrator Control Centre

**Scope, in dependency order**: Verification Centre consolidation (4 existing
queue pages → 1 tabbed page, +1 tab once ENTERPRISE-8 adds therapist
verification) → Promotion Manager (depends on ENTERPRISE-2's config
platform and the `Promotion` model from
`docs/ENTERPRISE-DATA-MODEL-CHANGES.md` §3 — build the model here, not
retrofitted from ENTERPRISE-3/4, since Admin is the actual owner of
promotion content) → Configuration Centre UI (the admin surface for
ENTERPRISE-2's tables, if not already built there) → granular permissions
(`docs/ENTERPRISE-DATA-MODEL-CHANGES.md` §9's `requirePermission()` helper,
additive to `src/server/rbac.ts`).
**Database changes**: `Promotion` model (moved here from the brief's own
§80 sequencing — see ENTERPRISE-3's note).

## ENTERPRISE-14 — Reporting & analytics

**Scope**: per-role report views over data that already exists everywhere
except the new Pharmacy financial tables — this stage is mostly "expose a
filtered/exportable view of a query the relevant service module already
runs," following the exact pattern Admin's `getDashboardMetrics()` already
established. No speculative charts per the brief's own §75 instruction
("do not implement meaningless charts simply to make dashboards look
enterprise") — every report here ties to a real operational question
(volume, SLA, revenue, funnel), same discipline `docs/UI-UX-AUDIT.md`
already enforced on the dashboard redesign.

## ENTERPRISE-15 — Enterprise QA / security / responsive validation

**Scope**: repeat the exact methodology `docs/UX-12-QA-REPORT.md` already
proved out — full screenshot pass at desktop/tablet/mobile plus this
brief's explicitly-named 375px width, live end-to-end verification of every
genuinely new interactive flow (not just static screenshots, per UX-12's
own lesson that a screenshot alone can't confirm a stateful action worked),
a real WCAG AA accessibility pass (keyboard-only + screen-reader spot
check, not just the lighter label/focus/contrast check UX-12 did), and the
brief's full §83 acceptance checklist verified item by item against the
live app. Also: a real OWASP-style review of every new surface this plan
adds (POS payment recording, promotion image uploads, configuration
endpoints) — extending, not repeating, `docs/SECURITY-REVIEW.md`'s existing
Phase 12 pass.

## What this plan deliberately does not resolve

Per this document's own governing instruction (§85: "do NOT immediately
start rewriting every page... STOP and review architecture before large
refactor"), three things are named but not decided:
1. **GST rate table and invoice-format requirements** (ENTERPRISE-7) —
   needs real accounting/legal input, not an engineering guess.
2. **Technical Support's incident-field shape** (ENTERPRISE-10) — a real
   product decision between two reasonable schema options.
3. **Sales pipeline stage reconciliation** (ENTERPRISE-11) — a naming
   decision between the existing 7-stage enum and the brief's 9-stage list.

None of these block starting ENTERPRISE-1/2 (design system, configuration
platform), which have zero dependency on any of the three.

## Immediate next step

This closes ENTERPRISE-0. Per this project's own established rhythm — every
one of the 12 backend phases and every UX-1..12 stage started only after an
explicit go-ahead on its own scope — **the next message from here should be
a decision, not more code**: confirm this scoping (especially the three
open decisions above, and whether ENTERPRISE-7's Pharmacy work should wait
for real GST guidance or proceed against placeholder rates for now) and say
go for ENTERPRISE-1. Implementation does not start automatically after this
document, matching the brief's own explicit instruction.
