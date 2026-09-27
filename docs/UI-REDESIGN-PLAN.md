# UI Redesign Plan

Sequencing and process for UX-1 through UX-12, following
`docs/UI-UX-AUDIT.md` (what's wrong) and `docs/PORTAL-UX-SPEC.md` (what each
portal should become). This is the execution order; it doesn't re-explain
findings or specs already written up in those two documents.

## Ground rules (from the brief, made concrete for this codebase)

- **Validation gate before and after every stage**: `npm run lint`,
  `npm run typecheck`, `npm test` (currently 103/103, stable across 3 runs
  per `docs/SECURITY-REVIEW.md`), `npm run build`. A stage isn't done if
  any of these regress.
- **Live browser verification per stage** — reuse the seeded demo accounts
  (all 10 roles now persistent in `prisma/seed.ts`) and the fixture data
  created for the audit (one real record per module: a completed
  consultation with finalized prescription and active care plan, a
  completed diagnostic order, a delivered medicine order, an in-progress
  Panchakarma booking, an open support ticket, a qualified partner lead —
  all attached to the seeded patient `+919876543210` and the correspondingly
  seeded doctor/lab/pharmacy/centre/sales accounts). This fixture data was
  written directly via Prisma, the same bootstrapped-fixture pattern used
  throughout Phases 4-12 (no real payment gateway exists in this
  environment); it's real, persistent rows, not a throwaway script.
- **Screenshot desktop (1440×900) and mobile (390×844) for every changed
  page**, before/after, kept alongside the stage's own completion report
  (per brief §31's reporting format) — not just "trust me, I built it."
- **No schema changes without a stated reason** — every "Data required"
  line in `docs/PORTAL-UX-SPEC.md` was checked against the actual schema
  before being written down; if a stage discovers it needs a field that
  doesn't exist, stop and write the migration decision down (mirroring
  this project's own established `docs/DECISIONS.md` discipline) rather
  than quietly fabricating a placeholder.
- **One stage, one reviewable unit of work** — matches this project's
  entire delivery history (12 backend phases, each reviewed before the
  next started). UX-1 through UX-12 get the same treatment, not one
  unattended sweep through all of them.

## Prerequisite (before UX-1): data hygiene

`docs/UI-UX-AUDIT.md` Finding 5 — duplicate/orphaned test doctors are
visible on the live public site right now. This is a data cleanup, not a
design task, and it's cheap and zero-risk: identify `DoctorProfile` rows
with test-pattern names/registration numbers left over from earlier
phases' Playwright verification runs (the same class of issue
`docs/IMPLEMENTATION-STATUS.md`'s Phase 8 entry already documented and
cleaned up once for `Medicine` rows) and remove them. Doing this first
means every "before" screenshot taken during UX-2 onward shows the real
public site, not test debris.

## UX-1 — Design Foundation

**Scope**: the shared component library `docs/PORTAL-UX-SPEC.md`'s
cross-portal section calls for — `MetricCard`, `DataTable`/
`ResponsiveTable`, `EmptyState`, `CarePlanProgress`, `Tabs` — plus the
mobile-nav scroll-affordance fix in `portal-shell.tsx` (every portal
benefits from this one fix simultaneously) and a centralized status-tone
mapping module. Typography/spacing scale additions to `globals.css`'s
`@theme` block if the audit's visual-hierarchy findings (doctor dashboard,
lab/centre detail pages) need more than the existing tokens provide.
**Why first**: every later stage depends on these existing before it's
touched, per the brief's own §16 rule ("do not create duplicate components
for every portal where a shared primitive works").
**Acceptance**: five new components exist, each used in at least one real
place (not built speculatively with no caller); `portal-shell.tsx`'s mobile
nav visibly indicates it scrolls on all 11 portal layouts sharing it in one
change.

## UX-2 — Public Website

**Scope**: homepage service-card grid, "How ABIES Works" steps,
partner-type-specific sections (brief §4-5) — additive to the existing
homepage, which already has a real hero and honest content (audit: "gap
here is visual polish, not honesty or structure").
**Acceptance**: homepage, doctor search, doctor profile screenshot-reviewed
at both viewports; duplicate-doctor prerequisite fix confirmed live on
this page specifically.

## UX-3 — Patient Portal

**Scope**: the dashboard rebuild is the entire point of this stage —
`docs/PORTAL-UX-SPEC.md`'s Patient dashboard section, replacing the
`COMING_SOON` array with the six real data-backed sections (next
appointment hero, care plan progress, diagnostics, medicines, Panchakarma,
family/support). This is the single highest-priority stage in the whole
plan (audit Finding 2).
**Acceptance**: log in as the seeded patient, dashboard shows the real
completed consultation's care plan, the real diagnostic order, the real
medicine order, and the real Panchakarma booking — zero "Coming Soon" text
remains anywhere on the page.

## UX-4 — Doctor Portal

**Scope**: dashboard pivot to "Today's Schedule / Next Patient / Tasks"
once `APPROVED` (keep the pre-approval view as-is — audited as correct for
that state). Consultation workspace gets visual-hierarchy polish only
(audited as structurally good already) — not a rebuild.
**Acceptance**: seeded doctor's dashboard shows the real completed
consultation surfaced as a "recent activity" item and (once a fresh
in-flight appointment fixture is added for this stage's own verification)
a real "Today's Schedule" entry.

## UX-5 — Admin Portal

**Scope**: smallest stage — add named/dated items under each verification
queue count (data already returned by each `queue()` service function,
just not rendered on the dashboard). No structural change to a portal
already audited as close to correct.
**Acceptance**: dashboard's "Doctors: N pending" expands to show the
actual N names.

## UX-6 — Lab Portal

**Scope**: full dashboard rebuild per spec (Today's Collections/Pending/
Processing/Reports Pending/Critical/Completed), order detail gets patient
name added, critical-flag visual treatment.
**Acceptance**: seeded lab's dashboard reflects the real completed order in
"Completed Today" on the day it's run; order detail shows "Asha Rao", not
just the test name.

## UX-7 — Pharmacy Portal

**Scope**: mirrors UX-6's shape for `MedicineOrderStatus` stages, plus
low-stock/expiring-soon flags on Inventory.
**Acceptance**: seeded pharmacy's dashboard reflects the real delivered
order; inventory view flags any batch under the display threshold or
within 30 days of `expiryDate` (seed data's `2028-01-01` expiry won't
trigger this — a stage-specific fixture batch with a near expiry should be
added to verify the flag actually renders, not just written and assumed).

## UX-8 — Panchakarma Centre Portal

**Scope**: dashboard rebuild per spec; booking detail gets patient name +
the real course-progress indicator (`Session 1 ✓ · Session 2 Today · ...`)
built from `sessionCount` vs. `PanchakarmaSession[]`.
**Acceptance**: seeded centre's booking detail for the real in-progress
booking (1 of 2 sessions attended) shows the progress indicator correctly
at both the "1 attended" and, after re-running the fixture's second
session as attended, "2/2 complete" states.

## UX-9 — Customer Support + Technical Support

**Scope**: tabbed queue segmentation (Unassigned/My Tickets/P1/P2/Awaiting
Customer/Resolved Today) shared by both portals, scoped to each one's
department. Technical Support gets the category-based visual
differentiation described in `docs/PORTAL-UX-SPEC.md`'s honest-scope note
— **not** fabricated request-ID/browser fields.

**Open question requiring a go-ahead before this stage, not silently
decided either way**: does Technical Support get real technical-context
fields (new `SupportTicket` columns or a side table) in a future phase, or
does it stay scoped to what `category`/`priority` already provide
indefinitely? This is a product/schema decision, not a UI one — flagging
it here rather than either quietly expanding scope into a migration or
quietly dropping the brief's ask.

**Acceptance**: both portals' queues show distinct tab counts from the same
underlying `listQueue()` data; ticket detail (already audited as the app's
best page) is unchanged, not regressed.

## UX-10 — Sales Portal

**Scope**: pipeline (Kanban-style column) view grouping existing leads by
`stage`; lead detail gets a stage-history timeline sourced from existing
`AuditEvent` rows (`resourceType = PartnerLead`) — no new table.
**Acceptance**: seeded "Sunrise Wellness Clinic" lead (stage `QUALIFIED`)
appears in the correct pipeline column; its detail page's timeline shows
the `CREATED` audit event from when the fixture was written.

## UX-11 — Care Coordinator Portal

**Scope**: merge the at-risk care-plan queue onto the portal's own
dashboard (currently a separate page) alongside clinical-concern tickets
surfaced first; add "Open ticket for this patient" from an at-risk item.
**Acceptance**: seeded coordinator's dashboard shows both the real at-risk
care plan items and the real open support ticket without navigating away
from `/care-coordination`.

## UX-12 — Cross-Portal QA

**Scope**: full re-run of the audit's own screenshot methodology (58 pages
× 2 viewports) against the post-redesign app, plus a tablet-width
(768px) pass that UX-0 explicitly deferred (`docs/UI-UX-AUDIT.md`'s
Responsive summary). Accessibility spot-check (contrast, focus states,
label associations) since it wasn't separately covered in UX-0. Full
`docs/UI-UX-AUDIT.md`-style findings list for anything still wrong,
reported honestly rather than declared complete by default.
**Acceptance**: brief §30's full checklist, verified item by item, not
asserted.

## Reporting format per stage (brief §31, applied literally)

Every stage's completion report must include, not just a "done":
**Implemented** (exact files), **Existing functionality reused** (what
wasn't touched, and why that's correct), **UX improvements** (specific
before/after, citing the audit finding it closes), **Browser verification**
(which routes, logged in as which seeded account), **Responsive
verification** (which viewports), **Automated verification** (lint/
typecheck/test/build results), **Screenshots reviewed** (list), **Remaining
gaps** (anything genuinely incomplete — the Technical Support schema
question is the standing example of a gap that stays a gap until a real
decision is made, not something to paper over).

## Immediate next step

UX-0 (this document, the audit, and the portal spec) is complete. Per this
project's own established delivery rhythm — twelve backend phases, each
built and verified only after an explicit go-ahead — the natural next
message is a decision, not more code: confirm the prerequisite data-cleanup
scope and the UX-1 component list above look right, then say go for UX-1.
Implementation does not start automatically after this document.
