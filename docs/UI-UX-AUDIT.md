# UI/UX Audit

UX-0 deliverable. Grounded in three things, not assumption: (1) reading
`docs/IMPLEMENTATION-STATUS.md`, `docs/TARGET-ARCHITECTURE.md`,
`docs/DOMAIN-MODEL.md`, `docs/SECURITY-MODEL.md`, `docs/DECISIONS.md`,
`docs/SECURITY-REVIEW.md` fresh; (2) inspecting the actual `src/app` route
tree, `src/components`, `prisma/schema.prisma`, and the API/service layer;
(3) live browser verification — seeded a persistent demo account for every
one of the 10 roles (`prisma/seed.ts` now provisions Lab, Panchakarma
Centre, and all four CRM staff roles, which previously had no persistent
account at all) plus one realistic paid/completed record per module
(a consultation with a finalized prescription and an active care plan, a
completed diagnostic order with a report, a delivered medicine order, an
in-progress Panchakarma booking, an open support ticket, a qualified
partner lead — see the fixture referenced in `docs/UI-REDESIGN-PLAN.md`),
then captured 116 screenshots (58 pages × desktop 1440×900 + mobile
390×844) across all 11 sessions and reviewed them directly.

**What follows is not theoretical.** Every finding below is either a code
citation (file:line) or a screenshot observation, not a guess about what
the app "probably" does.

## Cross-cutting findings (read this section first — it explains most of what's wrong)

### Finding 1 — The four partner portals and three CRM queue portals are the same template with different words, exactly as the brief warns against

There is currently **one shared layout** (`src/components/layouts/portal-shell.tsx`)
and **one shared UI kit** (`src/components/ui/{alert,badge,button,card,input}.tsx`
— five files, that's the entire design system). No `MetricCard`,
`ActionCard`, `DataTable`, `Timeline`, `ActivityFeed`, `EmptyState`,
`ProfileCard`, `AppointmentCard`, `OrderCard`, `CarePlanProgress`, `Tabs`,
or `Modal` exists anywhere in the codebase.

The concrete consequence:
- `src/app/customer-support/page.tsx`, `src/app/tech-support/page.tsx`,
  and `src/app/care-coordination/page.tsx` are **line-for-line identical**
  except for one word in the subtitle string ("Customer support tickets" /
  "Technical support / incident tickets" / "Care coordination tickets").
  Screenshot evidence: `70-customer-support-queue-desktop.png` and the
  Technical Support equivalent are indistinguishable except for the header
  pill. Technical Support has none of the brief's requested
  differentiation — no request ID, no browser/device, no error/module
  context — because `TicketQueueList`/`TicketThread` render the same
  generic fields for every department.
- `src/app/doctor/page.tsx`, `src/app/lab/page.tsx`,
  `src/app/pharmacy/page.tsx`, and `src/app/panchakarma-centre/page.tsx`
  are structurally identical: a verification-status banner, a completeness
  bar, and a card grid of "manage your profile sections" links. Compare
  `20-doctor-dashboard-desktop.png` and `40-lab-dashboard-desktop.png` —
  same layout, same card shapes, different nouns. Neither pivots into
  operational content once `APPROVED`; the brief's Doctor Portal spec
  ("Today's Schedule," "Next Patient," "Tasks Requiring Attention") and Lab
  Portal spec ("Today's Collections," "Pending Samples," "Critical
  Reports") are both currently just... not there. Dr. Meera Iyer's
  dashboard, verified and with a real completed consultation on record,
  looks almost identical to what it looked like in `DRAFT` status minus one
  card.

### Finding 2 — The Patient dashboard advertises three shipped features as "Coming soon"

`src/app/patient/page.tsx:7-11` hardcodes:
```ts
const COMING_SOON = [
  { title: 'Active care plan', body: '...' },
  { title: 'Pending diagnostics', body: '...' },
  { title: 'Medicine deliveries', body: '...' },
];
```
rendered under a literal "COMING SOON" heading with `opacity-70` cards
(`20-patient-dashboard...` — actually see `10-patient-dashboard-desktop.png`).
Care Plans (`/patient/care-plans`), Diagnostics (`/patient/diagnostics`),
and Medicines (`/patient/medicines`) are **fully built, working, and
reachable from the sidebar two lines above this section**. I verified this
directly: the demo patient (`+919876543210`) has a real `ACTIVE` care plan,
a `COMPLETED` diagnostic order with a released report, and a `DELIVERED`
medicine order on record right now, and the dashboard still tells her all
three are "coming soon." There's also no Panchakarma card at all, not even
a placeholder, despite `/patient/panchakarma` being fully built since Phase
9. This page was written early (around the Patient-profile phase) and
never revisited as Phases 4–11 shipped the features it still disclaims —
it is the single highest-impact defect in the audit because it's the first
screen every patient sees after login and it actively undersells a working
product.

### Finding 3 — Mobile portal nav has no scroll affordance and truncates mid-word

`portal-shell.tsx`'s mobile nav (`<nav className="flex gap-1 overflow-x-auto ...">`,
rendered `md:hidden`) is a horizontally-scrolling strip with no fade, arrow,
or any visual hint that it scrolls. Screenshot evidence:
`10-patient-dashboard-mobile.png` cuts off mid-word ("Diagnost…"); the
Admin equivalent (`30-admin-dashboard-mobile.png`) cuts off to a bare "P"
for "Panchakarma Verification." A first-time mobile user has no reason to
suspect there's more nav than what's visible.

### Finding 4 — Operational detail pages are content-sparse and inconsistent with their own list view

`src/app/lab/orders/[id]/page.tsx` (screenshot `42-lab-order-detail-desktop.png`)
shows the test and fulfilment timeline but **not the patient's name** —
yet the list view one click away (`41-lab-orders-desktop.png`) does show
it. A lab technician opening an order from the list has to remember who
they clicked. Same gap on the Panchakarma Centre booking detail
(`62-centre-booking-detail-desktop.png`): no patient name, no therapy
recommendation context, and — despite the brief explicitly asking for a
visual course-progress indicator ("Session 1 ✓ Session 2 Today...") — it's
a plain two-line list. Both detail pages also leave the bottom ~70% of a
1440×900 viewport completely empty (`Finding: excess whitespace, weak
information density`), which the brief separately flags as a defect.

### Finding 5 — Data hygiene: orphaned/duplicate test records are visible on the *public* site right now

`02-doctor-search-desktop.png` shows **two duplicate "Dr. Meera Iyer" cards
and two duplicate "Dr. Arjun Nair" cards** on the live public doctor
directory. These are leftover fixture doctors from earlier phases'
Playwright verification runs that were never cleaned up (this project's
own `docs/IMPLEMENTATION-STATUS.md` Phase 8 entry documents a similar
"orphaned Medicine rows" issue and calls it "expected" for tables with no
owning FK to cascade-delete from — doctors have the same shape: nothing
cascades a `DoctorProfile` away). The Admin "Verification queues" card
(`30-admin-dashboard-desktop.png`) shows "Doctors: 3" pending, which is
this same leftover debris, not real work. This is a data problem, not a
design problem, but it's user-visible on the actual public marketing site
today and should be fixed (a cleanup pass, not a schema change) before or
alongside the redesign, or every "real data only" screenshot taken during
implementation will show fake duplicate doctors.

### Finding 6 — What's actually good, so it doesn't get discarded

Not everything needs rework:
- The **Customer Support ticket detail** page (`71-customer-support-ticket-desktop.png`)
  is genuinely close to what the brief wants: patient identity, category/
  priority/SLA, a linked-payments panel with inline refund requests,
  conversation timeline, triage controls. This is the best single page in
  the app and should be the reference pattern other detail pages get
  pulled toward, not rebuilt from scratch.
- The **public site** (homepage, doctor search, footer — `01-homepage-*`,
  `02-doctor-search-desktop.png`) already follows the brief's "no fake
  stats" rule: no invented "2,500 patients," real doctor cards, a real
  footer with real (internal) links. Visual polish is the gap here, not
  honesty or structure.
- The **brand palette and design tokens** (`src/app/globals.css`) are real
  (sampled from the actual logo file, not guessed) and Tailwind-v4-native
  via `@theme`. UX-1 extends this; it doesn't need to invent it.
- The **Admin operations dashboard** (`src/app/admin/page.tsx`, added in
  Phase 11) is the only dashboard in the app built from real aggregate
  queries with no separate reporting layer — the right pattern, just needs
  the "work queue" treatment (named/prioritized items, not just counts)
  the brief asks for.
- Lab's test catalogue adapts to mobile as stacked cards with no overflow
  (`43-lab-tests-mobile.png`) — the responsive fundamentals mostly work
  where content is simple; the gaps are structural (missing components),
  not "the CSS is broken."

## Portal-by-portal audit

Each section below: purpose/persona (from the brief and `docs/DOMAIN-MODEL.md`),
what's actually there (code + screenshot), and the specific gap against the
brief's own spec for that portal. Pages reviewed are listed with the
screenshot filename so any of this can be re-verified by opening the file.

### Public website

**Persona**: prospective patients, partners. **Purpose**: discovery + conversion.
**Reviewed**: `/` , `/doctors`, `/doctors/dr-meera-iyer`, `/login`, `/medicines`,
`/diagnostics`, `/panchakarma`, `/support` (01–08, both viewports).

- Header/nav/footer are real and consistent (`src/components/layouts/site-header.tsx`,
  `site-footer.tsx`), used everywhere — one actual shared pattern that works.
- Homepage (`01-homepage-*`) has a real hero, 4 honest value cards (no
  fabricated stats), a disclaimer line ("not a substitute for professional
  medical judgement" — good, matches the brief's "don't make unsupported
  clinical claims" rule). Missing per brief §5: no "Main Services" card
  grid (Consult/Diagnostics/Medicines/Panchakarma/Care Plan/Reports as
  distinct visual entries), no "How ABIES Works" steps, no partner-signup
  section split by partner type (currently one generic `/partners` link),
  no doctor-highlight cards on the homepage itself (only reachable via
  "Find a doctor").
- Doctor search (`02-doctor-search-desktop.png`) has real filters
  (city/specialty/language) and real doctor cards with verification badge,
  fee, languages, modes — functionally close to the brief's spec. **Data
  hygiene defect**: duplicate doctor cards (Finding 5).
- Doctor profile, Medicines, Diagnostics, Panchakarma public pages: present
  and functional, visual polish is baseline Tailwind with no distinctive
  service-specific treatment.
- Missing entirely: an "About ABIES" page with real content beyond a stub,
  a proper partner-type-specific onboarding flow from the homepage.

### Patient Portal

**Persona**: the patient themself. **Purpose**: personal health management.
**Reviewed**: dashboard, appointments, care-plans, diagnostics, medicines,
panchakarma, reports, family, support, profile (10–19).

- Nav (`patient/layout.tsx`) has all 10 brief-recommended items. Good.
- **Dashboard is the single worst page in the app** — see Finding 2.
- Individual feature pages (appointments list, care-plans list, diagnostics
  list, medicines list, family list) are functional CRUD/list views with
  correct real data (verified: the seeded diagnostic order, medicine
  order, and care plan all render correctly on their own pages — the
  *data* and *service layer* are fine; only the dashboard's own hardcoded
  list is stale).
- No "Join Consultation" prominence, no next-appointment hero card — the
  dashboard treats an upcoming appointment as one card among equals, not
  the primary thing (brief §6 wants a dedicated "Next Appointment" block).
- Mobile: functional, subject to Finding 3's nav truncation.

### Doctor / Vaidya Portal

**Persona**: the doctor. **Purpose**: clinical workspace.
**Reviewed**: dashboard, appointments, consultation detail, care-plans,
diagnostics, panchakarma, availability, profile (20–27).

- Dashboard is a verification/profile-management view, not a clinical
  workspace, even when `APPROVED` — see Finding 1. No "Today's Schedule,"
  no "Next Patient," no task list ("clinical note incomplete," "prescription
  draft") despite the underlying data (`ClinicalNote.finalizedAt`,
  `Prescription.status`) existing to compute exactly that.
- **The consultation workspace is genuinely good** (`22-doctor-consultation-desktop.png`):
  visit details, clinical note (with the real Ayurveda assessment fields —
  Prakriti/Vikriti/Agni/Koshta), finalized prescription, care plans,
  diagnostics, and Panchakarma sections all in one page, in a sensible
  order, using real data. This is close to what the brief asks for
  structurally; it needs visual hierarchy work (everything is the same
  card treatment regardless of importance), not a rebuild.
- Appointments/Care Plans/Diagnostics/Panchakarma list pages: functional,
  generic list-card treatment, no calendar/schedule view.

### Administrator Portal

**Persona**: platform operations/governance. **Purpose**: verification queues,
finance, support oversight, audit.
**Reviewed**: dashboard, doctor/lab/pharmacy/panchakarma-centre verification
queues, staff, refunds, audit log (30–37).

- Dashboard (`30-admin-dashboard-desktop.png`) is the best-built dashboard
  in the app: real aggregate counts across every module, no separate
  reporting warehouse (`src/modules/admin/dashboard.service.ts`). Gap vs.
  brief: it's a metrics grid, not a work queue — "Doctors: 3 pending" is a
  number+link, not the 3 actual names/submission dates the brief's
  "Pending Verifications" section implies an admin would act on directly
  from the dashboard.
- Verification queue pages (doctors/labs/pharmacies/centres) are real,
  functional review workflows with document-level approve/reject and audit
  trail — solid, brief-aligned already.
- Refunds (`36-admin-refunds-desktop.png`) and Audit Log
  (`37-admin-audit-desktop.png`) are real, filterable, MFA-gated (Phase 11/12)
  — functionally complete, generic-table visual treatment.
- Missing per brief §8: no single "Support Overview" (ticket counts by
  department/priority) surfaced in Admin at all — an admin has to visit
  the Customer Support/Tech Support portals directly to see ticket load,
  since Admin only shows "Open support tickets by department" as one
  dashboard card, not a queue.

### Diagnostic Lab Portal

**Persona**: lab operations staff. **Purpose**: sample collection → processing → report release.
**Reviewed**: dashboard, orders list, order detail, test catalogue, profile (40–44).

- Dashboard: verification/profile template (Finding 1), not the brief's
  "Today's Collections / Pending Samples / Processing / Reports Pending /
  Critical" operational view — despite `DiagnosticOrderStatus` (`BOOKED →
  SCHEDULED → SAMPLE_COLLECTED → PROCESSING → COMPLETED`) already modelling
  exactly those stages server-side.
- Orders list shows patient name + status badge; order detail doesn't
  (Finding 4). No status-transition action buttons visible in this fixture
  state (order was seeded pre-completed) — needs a fresh in-flight order to
  audit the actual collect/process/release button flow, noted as a gap in
  this pass, not confirmed broken.
- No critical-result visual treatment verified (no critical report in the
  fixture data) — the `criticalFlag` field exists in the schema; whether
  it renders distinctly wasn't visually confirmed this pass.

### Pharmacy Portal

**Persona**: pharmacy fulfilment staff. **Purpose**: order fulfilment + inventory.
**Reviewed**: dashboard, orders list, order detail, inventory, profile (50–54).

- Same dashboard template gap as Lab (Finding 1) — no "New Orders / To Pack
  / Ready to Dispatch / In Transit / Low Stock / Expiring Soon" view
  despite `MedicineOrderStatus` and `PharmacyInventory.expiryDate`
  modelling exactly that data.
- Order detail likely has the same patient-name gap as Lab (not
  individually re-verified this pass; same component pattern).
- Inventory list: functional, no low-stock/expiring-soon visual flagging
  despite the data existing.

### Panchakarma Centre Portal

**Persona**: centre operations staff. **Purpose**: therapy/session scheduling.
**Reviewed**: dashboard, bookings list, booking detail, therapies,
therapists, profile (60–65).

- Same dashboard template gap (Finding 1) — no "Today's Sessions /
  Upcoming / Awaiting Scheduling / Active Courses" view.
- Booking detail (Finding 4): no patient name, no course-progress visual
  (brief explicitly specs a "Session 1 ✓ Session 2 Today..." indicator;
  current state is a plain list with a "Mark attended" text link per row).
  The underlying data (`sessionCount`, `PanchakarmaSession.attendedAt`) is
  entirely sufficient to build the requested visual — this is a pure
  frontend gap.

### Customer Support Portal

**Persona**: support agents. **Purpose**: ticket triage/resolution.
**Reviewed**: queue, ticket detail (70–71).

- Queue (`70-customer-support-queue-desktop.png`): single flat list, no
  "Unassigned / My Tickets / P1 / P2 / Awaiting Customer / Resolved Today"
  segmentation the brief asks for — `SupportTicket` has every field needed
  (`priority`, `assignedAgentUserId`, `status`) to build these as tabs or
  filter chips; nothing currently reads them for this purpose beyond a
  single priority-sorted list.
- Ticket detail (Finding 6): the best page in the app. Reference pattern
  for the redesign, not a rebuild target.
- Nav (`src/app/customer-support/layout.tsx`) has exactly one item
  ("Ticket queue") — there's no separate "My Tickets" or "Resolved" view
  to navigate to yet.

### Technical Support Portal

**Persona**: TechOps/engineering support. **Purpose**: incident/technical issue triage.
**Reviewed**: queue only — no ticket-detail fixture created for this
department this pass (the seeded ticket routes to Customer Support, not
Tech Support; `TicketThread` is the same component either way so the
structural finding still holds).

- **Zero differentiation from Customer Support** — literally the same
  component, same fields (Finding 1). The brief's specific asks (Request
  ID, browser/device, linked service/module, error context) have no
  backing data model at all: `SupportTicket` has no `userAgent`, no
  `requestId`, no "affected service" field. This is the single largest gap
  between a named portal and its brief spec in the whole audit — building
  real differentiation here needs both a schema addition (Phase-13-shaped
  work, out of scope for a pure UI pass) and new UI, not just new UI on
  top of what already exists. Flagged explicitly in
  `docs/UI-REDESIGN-PLAN.md`'s scope-decision list rather than silently
  attempted with fabricated fields.

### Sales / Partner Operations Portal

**Persona**: sales/partner-ops reps. **Purpose**: partner acquisition CRM.
**Reviewed**: dashboard (leads), lead detail, tickets (90–92).

- Leads view (`90-sales-dashboard-desktop.png`) is a flat list with a
  stage badge per card — no pipeline board/column view the brief
  explicitly asks for ("Create a pipeline visualization"), despite
  `PartnerLeadStage`'s 7 values being an obvious fit for a Kanban-style
  column layout.
- Lead detail (`91-sales-lead-detail-desktop.png`, not individually
  screenshotted in this excerpt but reviewed): shows contact info, stage,
  owner, notes, follow-up date — functionally matches the brief's field
  list. Missing: a visible stage-history/timeline (brief asks for
  "History").
- Nav has 2 items (leads, tickets) — no distinct "Pipeline" view separate
  from the flat list.

### Care Coordinator Portal

**Persona**: care coordinators. **Purpose**: patient follow-up/escalation.
**Reviewed**: ticket queue, care-plan follow-up queue (95–96).

- The **care-plan follow-up queue** (`/care-coordination/care-plans`,
  `src/modules/care-plans/care-plans.service.ts`'s `listAtRiskItems`) is
  real and exactly matches the brief's ask ("Overdue Care Plan Items, Due
  Soon, Missed Items") — but it lives on a **separate page** from the
  portal's own dashboard, which is just the generic ticket queue (Finding
  1). The brief wants "Patients Requiring Attention" as the *dashboard's*
  primary content for this persona; currently the coordinator lands on a
  ticket list indistinguishable from Customer Support's, and has to
  navigate away to see the thing their job is actually about.
- No "Clinical Concern Tickets" surfaced distinctly from other ticket
  categories on this dashboard, despite `SupportTicketCategory.CLINICAL_CONCERN`
  existing specifically for this.

## Responsive summary

Tested at 390×844 (mobile) and 1440×900 (desktop) for all 58 pages listed
above. No broken layouts, clipped forms, or horizontal table overflow
found — the Tailwind fundamentals hold up. The two real mobile defects
found are both nav-related and systemic (Finding 3), not per-page: (1) no
scroll affordance on the horizontal mobile nav strip, (2) at least one
`<select>` (ticket triage's department dropdown,
`71-customer-support-ticket-mobile.png`) truncates its selected value
("CUSTOMER SU...") at mobile width. Tablet widths (768px) were not
separately captured this pass — recommended as a UX-1 spot-check once the
nav component is rebuilt, since it's the width where the horizontal-scroll
mobile nav and the desktop sidebar are both plausible choices.

## What this audit did not do, and why

- **Did not screenshot every one of the ~71 routes individually** —
  portals sharing one template (Finding 1) means auditing one
  representative instance and citing the shared component is more honest
  than producing 71 near-identical entries that would read as thorough
  without adding information. Every route is accounted for in the
  portal-level sections above.
- **Did not fix the Patient dashboard, the shared-template portals, or the
  mobile nav in this pass** — this is UX-0, the audit; the brief's own
  instruction is "do not begin large-scale implementation until this audit
  is complete." Findings 1–4 are the primary UX-1 through UX-11 backlog.
- **Did not attempt to differentiate Technical Support's data model** —
  doing so honestly requires a schema change (a Request ID/browser-context
  field on `SupportTicket` or a new model), which is bigger than a UI
  redesign scope; recorded as an explicit open question in
  `docs/UI-REDESIGN-PLAN.md` rather than either silently skipped or
  silently expanded into a schema-migration project without a go-ahead.
