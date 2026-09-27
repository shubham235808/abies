# UX-12 — Cross-Portal QA Report

UX-12 deliverable, closing `docs/UI-REDESIGN-PLAN.md`'s UX-1 through UX-11
implementation work. Methodology: rebuilt the Docker image
(`docker compose build app`) and redeployed (`docker compose up -d app`)
against the same seeded fixture data used for `docs/UI-UX-AUDIT.md`, then
re-ran that audit's own screenshot script against the live app — 58 pages
× **three** viewports this time (desktop 1440×900, tablet 768×1024 — the
pass UX-0 explicitly deferred — and mobile 390×844), 174 screenshots
total, all reviewed directly. Two additional live end-to-end flows were
exercised beyond static screenshots (detailed below) because they involve
state changes a screenshot alone can't confirm.

## Automated verification

- `npx tsc --noEmit` — clean
- `npx eslint .` — clean (one pre-existing warning in
  `src/app/doctor/availability/availability-manager.tsx`, unrelated to
  UX-1–11, not introduced by this work)
- `npx vitest run` — 103/103 passed
- `npx next build` — succeeds, all 58+ routes compile
- `docker compose build app && docker compose up -d app` — image rebuilt
  and redeployed successfully; `/api/health` returns 200 post-deploy

## Findings from `docs/UI-UX-AUDIT.md`, verified closed

- **Finding 1** (shared generic template across Pharmacy/Lab/Panchakarma
  Centre/Customer Support/Tech Support/Care Coordination): closed.
  `50-pharmacy-dashboard-desktop.png`, `60-centre-dashboard-desktop.png`,
  `70-customer-support-queue-desktop.png` and
  `95-care-coordination-dashboard-desktop.png` are now visibly distinct,
  each with its own metric buckets built from that portal's own data.
- **Finding 2** (Patient dashboard hardcoded "Coming Soon"): closed.
  `10-patient-dashboard-mobile.png` shows real next-appointment, care-plan
  progress ("0 of 2 steps complete"), diagnostics, medicine order, and
  Panchakarma session-count cards, all sourced from live data.
- **Finding 3** (mobile nav truncates with no scroll affordance): closed.
  `mobile-nav-open.png` — the hamburger dropdown lists all 10 patient nav
  items with no truncation, active item highlighted.
- **Finding 4** (detail pages missing patient name + course-progress
  indicator): closed. `42-lab-order-detail-desktop.png` and
  `62-centre-booking-detail-desktop.png` both show "Order/Booking —
  {patient name}" headings; the booking detail additionally shows a
  `ProgressSteps` course indicator (Session 1 done, Session 2 current).
- **Finding 5** (duplicate/orphaned doctor fixture data on public site):
  already closed in the `f6226d1` cleanup prerequisite, reconfirmed here —
  `02-doctor-search-desktop.png` shows exactly one doctor (Dr. Meera Iyer).
- **Finding 6** (Customer Support ticket detail as reference quality): no
  regression — `71-customer-support-ticket-desktop.png` unchanged from the
  audit baseline.

## Live end-to-end verification beyond static screenshots

**Sales stage-history timeline** (UX-10): the seeded "Sunrise Wellness
Clinic" lead's detail page renders no History section as-is, because the
one-time UX-0 fixture script wrote that row with `prisma.partnerLead.create`
directly rather than through `leads.service.ts`'s `createLead()`, so it has
no `CREATED` audit event — a pre-existing fixture-data gap, not a UX-10
defect. Logged in as the seeded Sales account, edited the lead's notes
through the real UI, reloaded, and confirmed a "Stage updated → QUALIFIED"
entry appeared under **History** with a timestamp
(`lead-history-after-update.png`). The feature works correctly for every
real lead edit going forward; only the fixture's own origin event is
missing, and that's now the standing known gap for this feature (documented
here rather than silently left unexplained).

**Care Coordination "Open ticket for this patient"** (UX-11): the seeded
at-risk item's due date (Oct 7) sits outside `listAtRiskItems()`'s 2-day
horizon under today's date, so it doesn't appear at risk by default. Using
the doctor account's own `PATCH /api/care-plan-items/:id` (the same
endpoint the doctor's care-plan UI calls) to move the due date to tomorrow,
confirmed the item appeared under "Care plan follow-ups at risk"
(`care-coordination-at-risk.png`), clicked **Open ticket for this
patient**, confirmed navigation to the new ticket and that a P1
`CLINICAL_CONCERN` ticket now appears first under "Clinical concerns" on
reload (`care-coordination-clinical-concern.png`), then restored the item's
original due date through the same legitimate endpoint. The one ticket this
created was left in place — it's real, correctly-classified data
demonstrating a working feature, the same category as the rest of the
seeded fixtures.

One interaction gap worth flagging: the "Open ticket for this patient"
button has no guard against being clicked twice for the same item (each
click always files a new ticket) — low risk since it requires a deliberate
double-click by staff, not something to block on, but noted for a future
pass.

## Accessibility spot-check

- Label associations: form inputs across the rebuilt/touched pages use
  `<Label htmlFor>` / `id` pairs consistently with the pre-existing
  `src/components/ui/input.tsx` convention — no new unlabeled inputs
  introduced.
- Focus states: `Button` and `Input` components carry explicit
  `focus-visible`/`focus` outline styles (pre-existing, confirmed still
  intact). The new `Tabs`, `ListRow`, and `MetricCard` components render
  plain `<Link>` elements with no outline reset in `globals.css`, so they
  keep the browser's default focus ring — functional, not custom-styled.
  A dedicated focus ring for these is a nice-to-have, not a regression.
- Contrast: badge and alert color tokens (magenta/purple/orange text on
  white or tinted backgrounds) are unchanged from the existing design
  system audited in UX-0; no new color combinations were introduced.

## Responsive verification

All 58 pages captured at desktop (1440×900), tablet (768×1024, new this
pass), and mobile (390×844). No horizontal page-level scroll observed at
any width except the two components designed to scroll horizontally on
purpose: the Sales Kanban board (`90-sales-dashboard-mobile.png` — columns
clip at the viewport edge with the next one peeking in, same pattern as
other horizontally-scrollable strips in the app) and code/table-like
content that was already exempted in UX-0.

## Remaining gaps

- Sales lead-detail timeline: fixture lead has no `CREATED` audit event
  (see above) — cosmetic, fixture-only, doesn't affect real usage.
- Technical Support differentiation: still intentionally scoped to
  existing `category`/`priority` fields only, per the standing open
  schema question in `docs/UI-REDESIGN-PLAN.md` (request-ID/browser-context
  fields don't exist in the schema and were not fabricated).
- "Open ticket for this patient" double-submission guard: not implemented,
  flagged above as low-priority follow-up.

No other regressions or defects found across the 174-screenshot review.
