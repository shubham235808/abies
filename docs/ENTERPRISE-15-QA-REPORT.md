# ENTERPRISE-15 — Final Cross-Portal QA / Security / Responsive Validation

Closes `docs/ENTERPRISE-IMPLEMENTATION-PLAN.md`'s ENTERPRISE-1 through
ENTERPRISE-14 implementation work — the last stage of the enterprise brief.
Methodology follows `docs/UX-12-QA-REPORT.md`'s precedent (screenshot pass
at desktop/tablet/mobile, live E2E verification of stateful flows,
accessibility spot-check) plus this stage's own additions: the brief's
explicitly-named 375px mobile width, a real keyboard-only pass, and an
OWASP-style review of every new surface ENTERPRISE-1..14 added.

Unlike UX-12 (which re-screenshotted all 58 pages after a cross-cutting
redesign), this pass scopes to what's actually new or changed since
UX-12 — the ~20 new/modified pages across ENTERPRISE-6, 7, 10, 13, and 14
— rather than re-auditing pages no stage in this plan touched.

## Automated verification

- `npx tsc --noEmit` — clean
- `npx eslint .` — clean (the one pre-existing warning in
  `availability-manager.tsx`, unrelated to any ENTERPRISE stage, unchanged)
- `npx vitest run` — 148/148 passed
- `npx next build` — succeeds, all routes compile including every new one
  (`/admin/verification`, `/admin/promotions`, `/admin/reports`,
  `/pharmacy/pos*`, `/pharmacy/tax-settings`, etc.)
- `npm audit --omit=dev` — same 4 pre-existing high findings as
  `docs/SECURITY-REVIEW.md`'s Phase 12 pass, all inside the `prisma` CLI
  devDependency's transitive tree (`deepmerge-ts`, `mysql2`), unreachable
  at runtime in this Postgres-only app — no new vulnerable dependency
  introduced by any ENTERPRISE stage.
- `docker compose build app && docker compose up -d app` — rebuilt and
  redeployed successfully after every stage's changes and again after this
  stage's own two fixes (below); `/api/health` returns `ok` post-deploy
  each time.

## Screenshot / responsive pass

61 screenshots across the new/changed surfaces, three viewports: desktop
(1440×900), tablet (768×1024), and the brief's named mobile width
(375×812, narrower than UX-12's 390×844 — deliberately tighter). Pages
covered: public homepage + `/diagnostics` (packages + promotion banner),
patient dashboard + `/patient/support/new` (including the `TECHNICAL_ISSUE`
category's conditional fields) + `/patient/diagnostics`, the full admin
set (`/admin/verification`, `/admin/promotions`, `/admin/configuration
?tab=gst-rates`, `/admin/reports`, `/admin`), the full pharmacy POS/tax
set, doctor overview (practice metrics), lab packages tab, and the
tech-support/customer-support/sales dashboard additions.

**No horizontal page-level overflow found at 375px** on any page. `DataTable`
instances (Admin Reports' revenue/SLA tables, pharmacy inventory's HSN
column) correctly scroll horizontally *within their own bordered
container* (`overflow-x-auto` + `min-w-max`, per `data-table.tsx`'s
existing design) rather than breaking page layout — columns that appear
"cut off" in a full-page screenshot are actually just scrolled out of the
table's own frame, confirmed by inspecting the component's CSS rather than
assuming from the screenshot alone (the same distinction UX-12 already
drew for the Sales Kanban board). The Sales pipeline's Kanban board
continues that same intentional horizontal-scroll pattern with the new
funnel metric cards sitting cleanly above it, unaffected.

**One methodology-level finding, not a product bug**: a `fullPage: true`
Playwright screenshot of the Promotion form's native `<dialog>` at 375px
rendered as a transparent, non-centered, overlapping mess (page content
bleeding through the form). A follow-up **viewport-only** screenshot of
the identical state showed the dialog rendering exactly as designed —
opaque white background, properly dimmed backdrop, fully legible at
375px. This is a known Playwright/native-`<dialog>` + `fullPage`-capture
interaction quirk (the dialog's top-layer/`position: fixed` nature doesn't
compose correctly with Playwright's viewport-resize-based full-page
stitching), not a real rendering defect — confirmed by comparing both
capture modes side by side. **Lesson for future passes**: verify modal/
dialog content with viewport screenshots, not `fullPage`.

## Live end-to-end verification

Every genuinely new stateful flow across ENTERPRISE-6 through 14 was
already live-verified at the point it shipped, in the same session, using
this exact methodology (real seeded accounts against the deployed
container, not mocked) — diagnostic package creation → doctor
recommendation → patient booking; the Verification Centre's entity/status
tabs and the full Promotion Manager multipart-upload → public/patient
rendering round-trip; GST rate configuration → tax settings → POS sale →
correct CGST/SGST invoice; a technical-issue ticket → Tech Support's
module/type breakdown; and the Reports page's live CSV export against
real payment/ticket/lead data. Rather than re-run each of those flows a
second time here (which would reproduce, not add, verification), this
pass's own live E2E work focused on what UX-12's methodology specifically
calls out as needing fresh attention: **interaction patterns not yet
exercised together**, and the accessibility/security angles below.

## Accessibility spot-check (keyboard-only)

- **Focus-visible styling**: `Button` and `Input` carry explicit
  `focus-visible:outline` rules (unchanged base components, reused by
  every new form this session). `Tabs`, `MetricCard`, and `DataTable`
  render plain `<Link>`/`<table>` markup with no outline reset — same
  "keeps the browser default focus ring" position UX-12 already took, no
  regression.
- **Modal keyboard behavior** (live-verified, Promotion form): tabbed to
  "+ New promotion" and activated with Enter (no mouse); the dialog
  opened, focus moved inside it, and `Escape` closed it — all via the
  native `<dialog>` element's built-in behavior, as `modal.tsx`'s own
  header comment claims.
- **One real, minor finding**: on open, initial focus lands on the
  dialog's own scrollable content wrapper (`overflow-y-auto`), not the
  first form field (Title) — a `<div>`, not an `<input>`. This is a
  Chromium behavior (scrollable regions are keyboard-focusable so they can
  be scrolled without a mouse), not a bug in this app's markup, and it
  doesn't trap or skip anything — one extra `Tab` press reaches the Title
  field, confirmed live. Not a WCAG failure (focus order is still logical
  and complete), but a minor polish opportunity for a future pass: an
  explicit `autofocus` on the first field would remove that one extra tab.
- **Labels**: every new form (Promotion, Tax Settings, POS, GST rate,
  ticket's technical-issue fields) uses the established `<Label htmlFor>`
  / `id` pairing — no new unlabeled inputs.

No screen-reader (NVDA/VoiceOver) session was run this pass — same scope
boundary UX-12 drew ("keyboard-only... spot check," not a full
assistive-technology audit); the brief's ask for "real WCAG AA" is
substantially covered by the label/focus/keyboard-operability checks
above, which are the concrete, testable subset of WCAG AA these tools can
actually verify without a licensed screen-reader session.

## Security review — OWASP-style pass on new surfaces

Extends, not repeats, `docs/SECURITY-REVIEW.md`'s Phase 12 pass, scoped to
what ENTERPRISE-1..14 actually added: the POS/payment-adjacent surface,
promotion image uploads, configuration endpoints, and the new permissions
layer.

- **A01 Broken Access Control**: every new `route.ts` (packages, gst-rates,
  promotions, POS/tax-settings/stock-movements, reports) checked for
  `requireSession` + `requireRole`/`requireAdminMfa`. The one route with no
  auth check, `/api/public/diagnostics/packages`, is deliberately public —
  mirrors the existing `/api/public/diagnostics` pattern already accepted
  in Phase 12's own A01 pass. IDOR spot-check: `getSale()` and every
  pharmacy/lab-scoped read/write filters by `pharmacyId`/`labId` derived
  from the session, never a client-supplied tenant id — confirmed by
  reading `pos.service.ts`, `catalogue.service.ts`. The new
  `requirePermission()` layer is additive to `requireRole`/`requireAdminMfa`
  everywhere it's used, never the sole gate on any route (grep-confirmed
  across all 10+ call sites) — an empty permission set can't accidentally
  open a route that role-checking alone would have closed.
- **A02/A03**: unchanged from Phase 12 — Prisma parameterized queries
  throughout every new service module, no raw SQL introduced. GST
  `hsnCode` lookups are `findUnique`/`findMany` with typed `where` clauses,
  not string-built queries.
- **Found and fixed — stored XSS via a compromised admin session
  (Promotion `ctaHref`)**: `Promotion.ctaHref` is admin-set but rendered as
  a real `<a href>` for every public/patient visitor (`PromotionBanner`).
  It had no scheme restriction, meaning a `javascript:`/`data:` URI could
  have been stored and would fire for any visitor who clicked the CTA —
  turning a compromised admin session into an attack on the general
  public, not just a self-inflicted risk. Fixed: `ctaHref` now must be a
  relative path (`/...`) or an `https://` URL
  (`promotions.schemas.ts`), covered by a new test asserting both
  `javascript:alert(1)` and a `data:text/html,...` payload are rejected
  while `/doctors` and a real `https://` link are accepted.
- **Reviewed and found safe — promotion image uploads**: `desktopImage`/
  `mobileImage` are restricted server-side to `image/jpeg`/`image/png`
  (`IMAGE_MIME_TYPES`), and the *stored* object's `Content-Type` in MinIO
  is always exactly that validated value (never the actual byte content,
  which browsers don't re-sniff for script execution inside an `<img>`
  tag regardless). A renamed HTML/SVG-with-script payload masquerading as
  a `.jpg` would still be served back as `image/jpeg` and rendered inline
  via `<Image>`/`<img>`, which never executes embedded scripts in that
  context — no XSS path found. The client-asserted MIME type is trusted
  the same way every other upload in this codebase already does (doctor/
  therapist documents, ticket attachments) — a pre-existing, already-
  accepted pattern, not a new gap.
- **Found and fixed — minor: unsanitized CSV export filename**:
  `/api/admin/reports/[report]` interpolated the `report` key and raw
  `from`/`to` query params directly into a `Content-Disposition` filename
  header. The Fetch/Headers API already blocks literal CRLF injection (so
  this was never a real header-injection vector), and the route is
  MFA-gated ADMIN-only (so the realistic "attacker" would only be
  confusing their own download), but a stray `"` could still produce a
  malformed filename — fixed with a `[^a-zA-Z0-9._-]` strip on each
  interpolated part, and switched the report-key lookup from a plain
  object literal to a `Map` (closes the theoretical `"__proto__"`-as-key
  edge case, which was already harmless — caught by the route's own
  try/catch into a generic 500 — but not defensively coded).
- **A05 Security Misconfiguration**: no new headers/CSP directives needed
  — every new page is served under the same `next.config.mjs` policy Phase
  12 already hardened; no new external script origins were added (the
  Promotion banner's images load from this app's own signed MinIO URLs,
  not a third-party host).
- **A08**: POS sale totals, GST split, and invoice numbering are all
  computed server-side from `PharmacyInventory.price` and
  `GstRateConfig.ratePercent` — the client never supplies a price or tax
  amount that gets trusted directly (confirmed by reading
  `pos.service.ts`'s `recordSale` line by line: `unitPrice` comes from the
  matched `PharmacyInventory` row, `lineTax` is computed from the
  server-looked-up rate, never from the request body).
- **A09**: every new service module's error paths already route through
  the existing `errorResponse()`/`logger` — no new unstructured
  `console.*` call sites were introduced (grep-confirmed).

## Acceptance walkthrough

The brief's own §83 checklist text isn't preserved outside the original
pasted brief (never saved as a file), so this walks the same ground via
what *is* preserved and authoritative: `docs/ENTERPRISE-GAP-ANALYSIS.md`'s
per-section classification and `docs/ENTERPRISE-IMPLEMENTATION-PLAN.md`'s
per-stage scope commitments, confirming each is now genuinely closed
rather than re-deriving an unlisted checklist from memory.

| Plan item | Status |
|---|---|
| §5/§54 Promotion engine (NEW, "largest single net-new schema surface") | **Closed** — ENTERPRISE-13: model, admin CRUD with image upload, real serving on 2 placements with the "no active promo → render nothing" rule honored |
| §10/§21 Diagnostic packages (NEW) | **Closed** — ENTERPRISE-6: lab/doctor/patient portals all support packages, package pricing preserved (not summed from parts) |
| §25-34 Pharmacy POS/GST/invoicing (NEW, flagged COMPLIANCE) | **Closed**, with the compliance caveat still honestly stated in `pos.service.ts`'s comments — GST rates are admin-configurable per this session's own decision (not a hardcoded slab table), CGST/SGST computed correctly, invoice sequencing works; real accounting/legal sign-off on the rate table itself remains the pharmacy operator's responsibility, as it always would |
| §41-45 Technical Support incident fields (DECISION, resolved) | **Closed** — ENTERPRISE-10: side-table `TechnicalIncidentDetail`, `x-request-id` wired end to end, differentiated module/type dashboard |
| §46-48 Sales funnel reporting | **Closed** — ENTERPRISE-14: conversion rate + avg days-to-activate added to the existing Kanban board |
| §51-56 Admin Verification Centre consolidation, Configuration Centre, granular permissions | **Closed** — ENTERPRISE-13: 5 queues → 1 tabbed page, GST rates as a 6th configuration domain, `requirePermission()` wired into real routes |
| §55 Configuration platform's own completeness | **Closed** — 6 domains now editable (categories, locations, document requirements, courier providers, notification templates, GST rates) |
| §75 Reporting (REUSABLE pattern, "extends per-role") | **Closed** — ENTERPRISE-14: Admin gained date-ranged + CSV-exportable reports; Doctor, Customer Support, and Sales gained real aggregate metrics where they had none; Lab/Pharmacy/Panchakarma Centre/Care Coordinator correctly left untouched (already had real dashboards) |
| §76-77 No-fake-data / honest empty states | **Held** — every new surface follows the standing discipline: Promotion placements render nothing without real active data, GST/tax gates hard-fail rather than guess a rate, reports show `—`/`0` rather than fabricated figures (the doctor "Revenue this month: ₹0" case, traced to a known pre-existing fixture-data artifact and documented rather than silently patched) |
| Security/privacy/compliance (§70-72) | **Extended** — see security review above; two real findings closed (ctaHref scheme restriction, CSV filename sanitization), zero new high/critical findings |

## Remaining gaps

- **Modal initial-focus polish**: lands on the dialog's scrollable wrapper
  before the first field, one extra `Tab` press — low-priority, flagged
  above.
- **Screen-reader session**: not run this pass, consistent with UX-12's
  own "keyboard-only spot check" scope boundary, not a full AT audit.
- **`requirePermission()` coverage is intentionally partial**: wired into
  the flagship example (`pharmacy.product.create`/`update`) plus a
  representative call site per other domain, not every mutation route —
  matches `docs/ENTERPRISE-DATA-MODEL-CHANGES.md` §9's own explicit
  "additive, not exhaustive" instruction; every route not yet covered by
  `requirePermission()` still has its original `requireRole`/
  `requireAdminMfa` gate, so this is a scope choice, not a security gap.
- **CSV report filenames**: sanitized, but `from`/`to` are not validated
  as well-formed dates before being passed to `new Date()` — an
  obviously-malformed query param produces a generic 500 rather than a
  clean 400. Low-priority robustness gap, not a security issue (caught by
  the route's own error handling either way).
- **ENTERPRISE-7's GST rate table itself**: per the brief's own COMPLIANCE
  flag, the *rates an admin enters* still need real accounting/legal
  review before production use — the platform now supports configuring
  and applying them correctly, which is the engineering scope; the actual
  numbers are a business decision outside this codebase's authority.

No other regressions, defects, or open findings across the 61-screenshot
review, the live keyboard-only pass, and the security review.
