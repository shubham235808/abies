# Portal UX Specification

The UX contract for UX-1 through UX-11, written after `docs/UI-UX-AUDIT.md`
so every "Data Required" line below cites a field that actually exists in
`prisma/schema.prisma` today — nothing here requires inventing data to look
finished. Where a genuinely new capability would need a schema change, it's
called out explicitly rather than silently assumed or silently dropped.

Each portal's dashboard must answer the audit's own governing question:
**"What does this person need to accomplish when they log in today?"**

---

## Public Website

**Primary persona**: prospective patients, and people evaluating whether to
partner (doctor/lab/pharmacy/centre).
**Primary objective**: discovery → conversion (sign up or book), or partner
lead capture.
**Top tasks**: find a doctor, understand what ABIES does in one screen,
browse medicines/diagnostics/Panchakarma without an account, start a
partner enquiry, log in.
**Core screens**: Homepage, Doctor search, Doctor profile, Medicines,
Diagnostics, Panchakarma, About, Partners, Support (marketing), Contact,
Legal.
**Primary CTA**: "Find a Doctor" (homepage) / "Book" (catalogue pages).
**Secondary actions**: "Sign in", partner-type-specific "Partner with us"
links.
**Data required**: `DoctorProfile` (search/facets — already built),
`Therapy`/`PanchakarmaCentre`, `Medicine`/`PharmacyInventory`,
`DiagnosticTest`/`DiagnosticLab` — all real, already public-queryable.
**Mobile strategy**: mobile-first; hero/CTAs stack, service cards go
single-column, doctor cards go single-column with the same fields.
**Permissions**: fully public, no session.
**Empty states**: "No doctors match your filters — try a different city or
specialty" (search); never show 0 results with no explanation.
**Error states**: booking/payment errors surface the same
`ServiceUnavailableError`/"payments not configured" honesty pattern already
used throughout the app — do not soften this into a fake success state.
**Notifications**: none (anonymous).
**Cross-portal dependency**: reads only what Doctor/Lab/Pharmacy/Panchakarma
Centre portals have published as `APPROVED`+discoverable — never a
separate content source.

---

## Patient Portal

**Primary persona**: the patient (or someone managing a family member's care).
**Primary objective**: understand "what's happening with my care right now"
in one glance, then act on it.
**Top 5 tasks**: see next appointment, check care plan progress, see
pending diagnostics/reports, track medicine delivery, message support.
**Dashboard information** (all from real, already-modelled data — this
directly retires the "Coming Soon" placeholders, `docs/UI-UX-AUDIT.md`
Finding 2):
- Next appointment (`Appointment` where `status IN (CONFIRMED,
  PENDING_PAYMENT)`, soonest `scheduledAt`) as a hero card, not one card
  among equals — mode, doctor, join action if `VIDEO` and within window.
- Active care plan progress (`CarePlan.status = ACTIVE`, `CarePlanItem`
  counts by status) — replaces the "Active care plan — coming soon" card
  with the real thing.
- Pending diagnostics (`DiagnosticOrder` not yet `COMPLETED`) and reports
  ready (`Report`/`DiagnosticReport.releasedToPatientAt` not yet viewed).
- Medicine orders in flight (`MedicineOrder.status NOT IN (DELIVERED,
  CANCELLED)`) with `Shipment.trackingRef` if dispatched.
- Panchakarma course progress (`PanchakarmaBooking` where `status =
  IN_PROGRESS`), session count — currently has **no dashboard presence at
  all**, not even a placeholder; this is net-new, not a fix.
- Family switcher, Support ticket status if any `OPEN`/`WAITING_CUSTOMER`.
**Navigation**: unchanged from current (`patient/layout.tsx`'s 10 items are
already brief-aligned).
**Core screens**: Dashboard, Appointments, Care Plans, Diagnostics,
Medicines, Panchakarma, Reports, Family, Support, Profile.
**Primary CTA**: context-dependent — "Find a doctor" if no appointments
ever booked, "Join consultation" if one is imminent, otherwise "View
appointments."
**Secondary actions**: quick links to each module (already exist as cards;
keep the pattern, fix the content).
**Data required**: all listed inline above — zero new schema.
**Mobile strategy**: dashboard cards stack single-column in priority
order (next appointment first); nav gets a real mobile solution (see
"Cross-portal: Navigation & Design Foundation" below) instead of the
current unlabeled horizontal scroll.
**Permissions**: `PATIENT` only, scoped to own `userId` (already enforced
server-side — no change needed here, this is a UI-layer spec).
**Empty states**: "No upcoming appointments — find a doctor" (never a blank
hero card); "No active care plan yet — your doctor will start one after a
consultation."
**Error states**: failed payment/booking → the existing honest
`ServiceUnavailableError` messaging, not a generic "something went wrong."
**Notifications**: existing `Notification`/`NotificationPreference` model
already supports an in-app bell; not currently rendered anywhere in the UI
— candidate for UX-3 if time allows, not a hard requirement for this pass.
**Cross-portal dependency**: none (patient-scoped data only).

---

## Doctor / Vaidya Portal

**Primary persona**: the doctor.
**Primary objective**: run today's clinical work without hunting for it.
**Top 5 tasks**: see today's schedule, start the next consultation, finish
an incomplete note/prescription, review a patient's care plan, check
verification status (only while unapproved).
**Dashboard information**:
- Once `APPROVED`: **Today's Schedule** (`Appointment` where `scheduledAt`
  is today, `status = CONFIRMED`, ordered by time) as the primary content
  — not a card among profile-management cards.
- **Next Patient** hero card — soonest upcoming appointment today.
- **Tasks requiring attention**, computed from real state, not invented:
  consultations with `status = COMPLETED` but no `ClinicalNote.finalizedAt`
  (incomplete note); `Prescription.status = DRAFT` older than the
  consultation's end (draft prescription); `CarePlanItem` items owned by
  this doctor past `dueDate` with no `completedDate` (review needed).
- While `DRAFT`/`SUBMITTED`/`UNDER_REVIEW`/`REJECTED`: keep the current
  verification-status view essentially as-is (it's honest and correct for
  that state) — the fix is making it recede once `APPROVED`, not rebuilding
  it.
**Navigation**: unchanged (`doctor/layout.tsx`'s 8 items already cover
Appointments/Consultations/Care Plans/Availability/Clinics/Profile/Documents).
**Core screens**: Dashboard (two modes: pre-approval vs. approved),
Appointments, **Consultation workspace (keep as-is structurally — audited
as the app's best page)**, Care Plans, Availability, Clinics, Profile,
Documents.
**Primary CTA**: "Start consultation" (next patient card) once approved;
"Complete your application" while editable.
**Secondary actions**: "View patient", "Manage availability".
**Data required**: `Appointment`, `Consultation`, `ClinicalNote`,
`Prescription`, `CarePlanItem` — all exist, all already scoped by
`doctorProfileId` in the service layer.
**Mobile strategy**: today's schedule as a vertical timeline list; task
list stays a simple stacked list — this portal is used at a desk more than
on the move, so desktop-first layout is acceptable per the brief's own
"operational portals may be desktop-first" allowance, but must not break
on a phone between appointments.
**Permissions**: `DOCTOR`, scoped to own `doctorProfileId`.
**Empty states**: "No appointments today" (not a blank schedule);
"Nothing needs your attention" for an empty task list — a genuine positive
empty state, not a missing section.
**Error states**: existing patterns (ownership 404s, `ForbiddenError`)
unchanged.
**Notifications**: same in-app bell candidate as Patient.
**Cross-portal dependency**: consumes `Appointment`/`Payment` state written
by the Patient booking flow; writes `PanchakarmaRecommendation`/
`DiagnosticRecommendation` consumed by the Centre/Lab portals.

---

## Administrator Portal

**Primary persona**: platform operations/compliance.
**Primary objective**: see what needs a decision today, decide it, trust
the audit trail.
**Top 5 tasks**: clear verification queues, review a refund request,
check for support/SLA risk, provision a staff account, spot-check the
audit log.
**Dashboard information**: keep every existing metric
(`src/modules/admin/dashboard.service.ts`'s `getDashboardMetrics` output —
real, no reporting warehouse, do not regress this). Add, without new
queries beyond what already exists: render "Verification queues" as the
first 2-3 actual pending applicants (name + submitted date) under each
count, not just a number — `queue()` in each partner's admin service
already returns this list, it's just not surfaced on the dashboard today.
**Navigation**: unchanged (8 items already cover verification × 4, Staff,
Refunds, Audit Log — add nothing, this is complete).
**Core screens**: Overview, 4× Verification queue + detail, Staff, Refunds,
Audit Log.
**Primary CTA**: "Review" on the oldest pending item in whichever queue has
the most items.
**Secondary actions**: "Provision staff account", "Approve/reject refund".
**Data required**: no new fields — `queue()` per partner module, `Refund`,
`AuditEvent` all exist.
**Mobile strategy**: desktop-first is acceptable (admin ops is not a
mobile workflow) — verify metric cards reflow to single-column, already
confirmed working.
**Permissions**: `ADMIN` + `mfaVerified` (already enforced — no change).
**Empty states**: "Nothing pending" per queue (already correct).
**Error states**: unchanged.
**Notifications**: not required for this persona.
**Cross-portal dependency**: reads every other portal's state; writes
nothing any other portal reads back except verification status itself.

---

## Diagnostic Lab Portal

**Primary persona**: lab operations staff.
**Primary objective**: move today's orders through collection → processing
→ report release without missing one.
**Top 5 tasks**: see what needs collecting today, mark a sample collected,
upload/release a report, flag a critical result, manage the test catalogue.
**Dashboard information** — all derivable from `DiagnosticOrderStatus`
(`BOOKED → SCHEDULED → SAMPLE_COLLECTED → PROCESSING → COMPLETED`), no
schema change:
- Today's Collections: orders with `scheduledAt` today, `status =
  SCHEDULED`.
- Pending Samples: `status = BOOKED` or `SCHEDULED` past `scheduledAt`.
- Processing: `status = PROCESSING`.
- Reports Pending: `status = PROCESSING` with no `DiagnosticReport` yet.
- Critical: `DiagnosticReport.criticalFlag = true` and
  `doctorAcknowledgedAt IS NULL` — visually distinct, not alarmist (per
  brief).
- Completed Today: `status = COMPLETED` with `updatedAt` today.
**Navigation**: unchanged (Overview/Profile/Test catalogue/Orders).
**Core screens**: Dashboard, Orders list, Order detail (add patient name —
audit Finding 4), Test Catalogue, Profile.
**Primary CTA**: "Mark collected" / "Upload report" depending on order
status.
**Secondary actions**: "Flag critical", "Manage test catalogue".
**Data required**: all exists; order detail needs `patientUser` included
in its query (currently omitted — a one-line service fix, not a redesign).
**Mobile strategy**: table → stacked cards, matching what already works
for the test catalogue (`43-lab-tests-mobile.png` — already correct
pattern, reuse it for orders).
**Permissions**: `LAB`, scoped to own `labId`.
**Empty states**: "No collections today."
**Error states**: unchanged.
**Notifications**: critical-result flag should trigger the existing
`notify()` path to the ordering doctor — verify this already fires
(`modules/diagnostics/orders.service.ts`); if not, this is a real backend
gap to log, not a UI concern.
**Cross-portal dependency**: fulfils `DiagnosticRecommendation` written by
Doctor portal; writes `DiagnosticReport` read by Patient and Doctor portals.

---

## Pharmacy Portal

**Primary persona**: pharmacy fulfilment staff.
**Primary objective**: fulfil orders correctly and keep stock from expiring
unnoticed.
**Top 5 tasks**: accept a new order, pack it, dispatch it, restock/flag
low inventory, catch expiring batches.
**Dashboard information** — from `MedicineOrderStatus` (`PENDING →
ACCEPTED → PACKING → DISPATCHED → DELIVERED`) and `PharmacyInventory`:
- New Orders (`status = PENDING`, payment `SUCCESS`), To Pack (`ACCEPTED`),
  Ready to Dispatch (`PACKING`), In Transit (`DISPATCHED`).
- Low Stock: `PharmacyInventory.quantityAvailable` below a small fixed
  threshold (e.g. 10 — a UI display threshold, not a new schema field).
- Expiring Soon: `expiryDate` within 30 days.
**Navigation**: unchanged.
**Core screens**: Dashboard, Orders list, Order detail (add patient name),
Inventory (add low-stock/expiring visual flags), Profile.
**Primary CTA**: the order's next valid action (Accept/Pack/Dispatch).
**Secondary actions**: "Add inventory batch".
**Data required**: all exists.
**Mobile strategy**: same stacked-card pattern.
**Permissions**: `PHARMACY`, scoped to own `pharmacyId`.
**Empty states**: "No orders right now."
**Error states**: unchanged.
**Notifications**: dispatch/delivery already triggers patient
notifications (Phase 8) — no change needed here.
**Cross-portal dependency**: fulfils prescriptions written by Doctor
portal and OTC orders from the public catalogue; writes `Shipment` read by
Patient portal.

---

## Panchakarma Centre Portal

**Primary persona**: centre operations staff.
**Primary objective**: run today's therapy sessions and keep courses on track.
**Top 5 tasks**: see today's sessions, schedule the next session in a
course, mark attendance, manage therapy/therapist catalogue.
**Dashboard information** — from `PanchakarmaSession.scheduledAt`/
`attendedAt` and `PanchakarmaBooking.status`:
- Today's Sessions, Upcoming Sessions, Bookings Awaiting Scheduling
  (`status = BOOKED`, session count < scheduled count), Active Courses
  (`IN_PROGRESS`), Completed (`COMPLETED`).
**Navigation**: unchanged.
**Core screens**: Dashboard, Bookings list, Booking detail (add patient
name + a real course-progress bar — audit Finding 4), Therapies,
Therapists, Profile.
**Booking detail must show**: patient, therapy, recommending doctor if
`recommendationId` is set, session count, completed/remaining, assigned
therapist(s), and a visual progress indicator
(`Session 1 ✓ · Session 2 Today · Session 3 Scheduled`) built directly from
`sessionCount` vs. `PanchakarmaSession[]` — no new field required.
**Primary CTA**: "Schedule next session" / "Mark attended".
**Secondary actions**: manage therapy/therapist catalogue.
**Data required**: all exists.
**Mobile strategy**: stacked-card pattern; progress indicator must reflow
to a vertical list on narrow screens, not a horizontal bar that clips.
**Permissions**: `PANCHAKARMA_CENTRE`, scoped to own `centreId`.
**Empty states**: "No sessions today."
**Error states**: unchanged.
**Notifications**: session-scheduled notification already exists (Phase
9) — no change.
**Cross-portal dependency**: fulfils `PanchakarmaRecommendation` from
Doctor portal; writes session data read by Patient and (recommending)
Doctor portals.

---

## Customer Support Portal

**Primary persona**: L1/L2 support agents.
**Primary objective**: clear the queue fast without losing context.
**Top 5 tasks**: claim an unassigned ticket, resolve a payment/booking
issue, escalate a clinical concern, process a refund inline, close
resolved tickets.
**Dashboard information**: segment the existing `listQueue()` result
client-side into tabs/chips — **no new query needed**, `SupportTicket`
already has every field:
- Unassigned (`assignedAgentUserId IS NULL`), My Tickets
  (`assignedAgentUserId = me`), P1, P2, Awaiting Customer
  (`status = WAITING_CUSTOMER`), Resolved Today (`status = RESOLVED`,
  `updatedAt` today).
**Navigation**: add "My Tickets" and "Resolved" as real nav items (or tabs
on one page) — currently only "Ticket queue" exists.
**Core screens**: Queue (tabbed), Ticket detail — **keep exactly as
built** (audit Finding 6: this is the reference-quality page in the app).
**Primary CTA**: "Claim" (unassigned) / "Reply" (assigned).
**Secondary actions**: triage (department/priority), request refund
(already built), resolve/close.
**Data required**: all exists.
**Mobile strategy**: tabs become a horizontal scroll or a select — needs
the same nav-affordance fix as the cross-portal nav issue (see below).
**Permissions**: `CUSTOMER_SUPPORT` (+ `ADMIN`), department-scoped.
**Empty states**: "Nothing in this view" per tab.
**Error states**: unchanged.
**Notifications**: new-ticket/new-message notifications already exist
(Phase 10).
**Cross-portal dependency**: reads/writes `Payment`/`Refund` state also
visible in Admin; tickets can reference any module's order/booking.

---

## Technical Support Portal

**Primary persona**: TechOps/engineering support.
**Primary objective**: triage and resolve technical/system issues,
distinctly from customer service issues.
**Top 5 tasks**: see open technical tickets by severity, check SLA risk,
resolve or hand off, spot patterns across incidents.

**Honest scope note** (carried over from the audit): the brief asks for
request ID, browser/device, and linked-service context on every ticket.
`SupportTicket` has none of these fields today — building them for real
(not fabricated placeholder text) requires either a new
`SupportTicketTechnicalContext` side-table or new columns, which is a
schema decision, not a UI one. **This spec's UX-9 scope is limited to
what's buildable from existing data**: the same tabbed-queue pattern as
Customer Support, filtered to `department = TECH_SUPPORT`, with the
`category = TECHNICAL_ISSUE` tickets visually distinguished from other
categories that land in this queue. The technical-context fields are
logged as a proposed schema addition for a future phase, not attempted
here with placeholder data.

**Dashboard information**: Open Technical Tickets, P1/P2, Assigned to Me,
SLA Risk (`sla.responseDueAt` in the past, `status != RESOLVED/CLOSED`),
Recently Resolved.
**Navigation**: mirrors Customer Support's tabbed structure.
**Core screens**: Queue (tabbed), Ticket detail (same component as
Customer Support — this is fine to share; the *portal identity* comes from
which department's queue it's scoped to and the SLA-risk framing, not a
different ticket UI).
**Primary CTA**: "Claim" / "Reply".
**Data required**: existing fields only, per the scope note above.
**Mobile/Permissions/Empty/Error/Notifications**: same as Customer Support.
**Cross-portal dependency**: same ticket infrastructure as Customer
Support and Care Coordination.

---

## Sales / Partner Operations Portal

**Primary persona**: sales/partner-ops reps.
**Primary objective**: move partner leads through the pipeline without
ever bypassing real verification.
**Top 5 tasks**: log a new lead, see the pipeline at a glance, follow up on
a due date, claim an unowned lead, track progress to Activated.
**Dashboard information**: a real pipeline view — group the existing
`listLeads()` result by `PartnerLeadStage` into columns/counts (Lead,
Qualified, Verification, Commercial, Enablement, Activated, Rejected), not
a flat list. **No new query** — `stage` already exists on every lead.
**Navigation**: "Pipeline" (new, the grouped view) + existing "Partner
leads" (flat list/search) + "Tickets".
**Core screens**: Pipeline (new), Leads list, Lead detail (add a stage-
history timeline — see cross-cutting note on `AuditEvent` below), Tickets.
**Primary CTA**: "Add lead".
**Secondary actions**: "Claim", "Advance stage", "Log follow-up".
**Data required**: `PartnerLead` (exists). Stage-history timeline can be
built from `AuditEvent` rows already written for `PARTNER_LEAD` /
`UPDATED` actions (`modules/partners/leads.service.ts` already calls
`recordAuditEvent` on every stage change) — filter the existing audit log
by `resourceType = PartnerLead, resourceId = <lead>`, no new table.
**Mobile strategy**: pipeline columns collapse to a stage-filtered single
list on mobile (a true Kanban board doesn't fit 390px — don't force it).
**Permissions**: `SALES` (+ `ADMIN`).
**Empty states**: "No leads in this stage yet."
**Error states**: unchanged.
**Notifications**: not currently modelled; not required for this pass.
**Cross-portal dependency**: **must never** let `stage = ACTIVATED` imply
real verification — that stays owned by each partner module's own
`verificationStatus`, exactly as already designed
(`docs/DOMAIN-MODEL.md` §12's own explicit rule, already correctly
implemented in `modules/partners/leads.service.ts`). This spec changes
nothing about that boundary.

---

## Care Coordinator Portal

**Primary persona**: care coordinators.
**Primary objective**: catch patients falling behind on their care plan
before it becomes a bigger problem.
**Top 5 tasks**: see who needs attention today, review overdue plan items,
escalate a clinical concern ticket, follow up with a patient, hand off to
the right person (never edit clinical instructions themselves — brief's
explicit boundary, already correctly enforced: `listAtRiskItems()` is
read-only).
**Dashboard information**: **make `listAtRiskItems()` the dashboard's
primary content**, not a separate page — this is the single highest-value
fix for this portal and requires no new query, only moving what
`/care-coordination/care-plans` already renders onto `/care-coordination`
itself, with the ticket queue (filtered to `category = CLINICAL_CONCERN`
tickets surfaced first) alongside it.
**Navigation**: Dashboard (merged view above), Ticket Queue (all
categories), Care Plans (the detailed list, still available on its own
page for deep review).
**Core screens**: Dashboard, Ticket Queue, Care Plan follow-up list.
**Primary CTA**: "Open ticket for this patient" from an at-risk item (a
new, small action — creates a `SupportTicket` pre-filled with
`linkedPatientUserId`, using the existing ticket-creation service).
**Secondary actions**: none requiring new clinical-edit permissions —
explicitly out of scope, matching the brief's boundary.
**Data required**: `CarePlanItem` (exists), `SupportTicket` (exists).
**Mobile strategy**: at-risk list and ticket queue both already reflow as
stacked cards.
**Permissions**: `CARE_COORDINATOR` (+ `ADMIN`).
**Empty states**: "Nothing at risk right now" (already correct wording in
the existing page).
**Error states**: unchanged.
**Notifications**: not currently modelled for this persona.
**Cross-portal dependency**: reads care plans written by Doctor portal;
reads/writes tickets shared with Customer/Tech Support.

---

## Cross-portal: Navigation & Design Foundation (applies to every portal above)

Not a portal itself, but every spec above depends on it, so it's specified
once here rather than repeated 8 times:

1. **Mobile nav must show it scrolls.** Minimum fix: a fade/gradient mask
   at the trailing edge of `portal-shell.tsx`'s horizontal nav strip, or
   (better) collapse into a bottom sheet / hamburger drawer below `md`,
   per the brief's own "Sidebar → drawer/bottom navigation" instruction.
   This single fix improves every portal simultaneously.
2. **A `StatusBadge` mapping module** (`src/components/ui/status.ts` or
   similar) — centralizes the tone-per-status logic that today lives as
   ad hoc `Record<string, Tone>` maps scattered across `badge.tsx`. Not
   urgent (current approach isn't broken, just not centralized per the
   brief's §21 ask) — bundle into UX-1, not a blocking prerequisite.
3. **New shared components actually needed**, in priority order:
   `MetricCard` (Admin, Lab, Pharmacy, Centre dashboards all need this),
   `DataTable`/`ResponsiveTable` (every "orders/bookings list" page),
   `EmptyState` (every list page currently hand-rolls its own "nothing
   here" text), `CarePlanProgress` (Patient dashboard + Doctor consultation
   + Panchakarma booking detail all need a progress-bar pattern),
   `Tabs` (Customer/Tech Support queue segmentation, Sales pipeline).
   Full list and build order in `docs/UI-REDESIGN-PLAN.md`'s UX-1 section.
