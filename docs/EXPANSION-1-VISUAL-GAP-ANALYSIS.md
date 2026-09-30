# EXPANSION-1 — Visual Design Reconciliation, Gap Analysis

Companion to `docs/EXPANSION-IMPLEMENTATION-PLAN.md` (this displaces the
original EXPANSION-1 "Settlement" slot; Settlement moves to EXPANSION-2 —
see the renumbering note at the end of this document). Source: the
15-screen UI/UX reference image supplied directly in chat (the "approved
ABIES UI/UX image references" `ABIES-AGENTIC-DEVELOPMENT-MASTER-PROMPT.md`
Section 3 names as required source material, not previously supplied).

## Method

Compared the reference against live screenshots of the equivalent current
pages (`/`, `/doctors`, `/medicines`, and code-review of the remaining
11 reference screens against the actual implementation) before writing
anything below — the same "verify against the real running app, don't
assume" discipline this whole project has used throughout.

## Finding: most of the gap is real visual/layout work, not fabrication risk

Per screen, classified the same way `docs/ENTERPRISE-GAP-ANALYSIS.md`
classified the original brief:

| # | Screen | Classification | What's actually needed |
|---|---|---|---|
| 1 | Homepage | UI_REDESIGN | Hero imagery + gradient treatment, category tile strip linking to existing catalogues. **Blocked on a real image asset** — see open items. |
| 2 | Product Catalogue | UI_REDESIGN + BACKEND_EXT | Category sidebar (groups `Medicine.category`, already populated), price-range filter (existing `price` field), brand filter (existing `brandName` field) — all real, additive query params. Star ratings **excluded** unless a real review system is approved (see open items). |
| 3 | Product Detail | UI_REDESIGN, one real gap | Layout/imagery is straightforward. The "Pack Size" variant selector (250gm/500gm/1kg as one product) implies a product-variant model that doesn't exist today — each `Medicine` row is one specific SKU, not a variant group. Needs a decision, not an assumption. |
| 4 | Doctor Discovery | UI_REDESIGN + one real, buildable gap | Card layout, specialty tag styling — straightforward. Doctor photo: genuinely missing (`DoctorProfile` has no `photoUrl`), buildable now, no fabrication risk — same pattern as the existing document-upload flow. Star rating/review count: **excluded** unless approved (see open items). |
| 5 | Doctor Profile | UI_REDESIGN, one real gap | Tabs (Overview/Experience/Location) map to existing fields. "Education" as its own structured tab implies a field that doesn't exist (`primaryQualification` is a single string today, not a history) — small additive schema change if wanted. "Reviews" tab: excluded unless approved. |
| 6 | Appointment Booking Flow | UI_REDESIGN | A stepper/wizard treatment over the existing real booking flow (slot → mode → payment already all work) — no new backend. |
| 7 | Payment & Confirmation | UI_REDESIGN | Visual wrapper around the existing real Razorpay flow. |
| 8 | Panchakarma Treatments | UI_REDESIGN | Hero + icon row + cards over existing real therapy data. |
| 9 | My ABIES Patient Dashboard | UI_REDESIGN | Reorganizes already-real data (appointments, orders, reports, "near you" sections already built in ENTERPRISE-4). No new backend. |
| 10 | Doctor Workspace | UI_REDESIGN | Sidebar + table layout over existing real appointment data. |
| 11 | Consultation Screen (Doctor) | **Flagged — do not fake** | The reference shows a live two-way video call in progress. The actual platform has no connected video provider — the existing consultation page's own honest message says exactly that ("Video calling is not connected to a live provider in this environment yet"). Restyling this screen to *look* like a live call would violate this project's standing no-fake-integration rule. Redesign the layout, keep the existing honest placeholder state, unless real video-provider integration is separately approved. |
| 12 | Pharmacy Orders Management | UI_REDESIGN | Table/status layout over existing real order data. |
| 13 | Inventory & Batch Management | UI_REDESIGN | Table layout over existing real batch/expiry/stock fields (already in `PharmacyInventory`). |
| 14 | Management Command Centre | UI_REDESIGN + BACKEND_EXT, real and buildable | KPI cards already exist as `MetricCard`s. The revenue trend line + breakdown pie are new, but computable from real `Payment` data (no fabrication) — needs a lightweight charting approach decided (see open items), consistent with this app's "no new runtime dependency unless justified" precedent (native `<dialog>` for modals, hand-rolled SVG elsewhere). |
| 15 | (Panchakarma Treatments, repeated numbering in the source image) | — | Covered under #8. |

## Open items — need a decision before implementation, not an assumption

1. **Ratings & reviews (doctors and products)**. This is the single
   biggest one. It's not styling — it's a real user-generated-content
   feature: who can leave a review, when (only after a completed
   appointment/order?), moderation, display of an aggregate score. It
   also runs directly against a principle the platform's own source
   blueprint states explicitly: *"A marketplace that ranks providers
   only by commission paid"* is named as what the platform should
   **not** become, and quality is supposed to be built from *"objective
   operational metrics, not pay-to-rank."* A naive star-rating widget
   risks becoming exactly that anti-pattern if it's not designed
   carefully (e.g., verified-transaction-only reviews, no rating
   visible until a minimum sample size, no doctor-search sort-by-rating
   that could reintroduce a popularity-contest dynamic). **Decision
   needed**: build a real review system (real scope, its own stage), or
   drop the star-rating/review-count visual element from the redesign
   and keep everything else.
2. **Shopping cart**. No cart concept exists today — medicine ordering
   is a single "select items, book, pay" transaction, not a persistent
   browse-then-checkout cart with a header icon/badge. Reference shows a
   real cart icon with item count. **Decision needed**: build a real
   multi-item persistent cart (its own real feature — session/DB-backed
   cart state, add/remove/update quantity, cart page), or restyle the
   existing direct-order flow without a persistent cart (an "Add to
   Cart" button that immediately opens the existing order flow, no
   separate cart state to manage).
3. **Product variants (pack size)**. Needs a decision: add a
   `MedicineVariant`-style model (one product, several purchasable
   sizes/prices), or keep one `Medicine` row per SKU and drop the
   variant selector from the redesign.
4. **Homepage hero photography**. The reference uses a lifestyle/family
   photograph. No such asset exists in this repo, and I won't source or
   fabricate stock photography without it being supplied or explicitly
   approved (image licensing and the "premium healthcare imagery" brand
   requirement in the master prompt's own Section 8.1 both call for a
   real, approved asset, not a placeholder).
5. **Live video consultation**. Confirmed out of scope for this visual
   pass (see row 11) unless the user wants to separately scope real
   video-provider integration — a substantial project on its own, not a
   restyle.
6. **Charting approach for the Command Centre**. Recommend a small,
   dependency-free, hand-rolled SVG chart component (matching this
   app's existing "no new runtime dependency unless justified"
   precedent) over adding a charting library — flagged for confirmation,
   not assumed.

## Renumbering `docs/EXPANSION-IMPLEMENTATION-PLAN.md`

Per explicit direction, this visual pass runs **before** Settlement:

- **EXPANSION-1** — Visual design reconciliation (this document's scope,
  once the open items above are resolved)
- **EXPANSION-2** — Settlement engine (previously EXPANSION-1)
- **EXPANSION-3** — FMCG catalogue (previously EXPANSION-2)
- **EXPANSION-4** — Inpatient hospital module (previously EXPANSION-3)
- **EXPANSION-5** — Four-app migration (previously EXPANSION-4)
- **EXPANSION-6** — Final QA/security/responsive pass (previously
  EXPANSION-5), extended to also cover the redesigned screens
