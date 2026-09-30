# Expansion Implementation Plan

Closes Phase 0 of `ABIES-AGENTIC-DEVELOPMENT-MASTER-PROMPT.md`. Companion
docs: `EXPANSION-GAP-ANALYSIS.md` (what's new and why),
`EXPANSION-DOMAIN-MODEL.md` (schema sketch), `EXPANSION-TARGET-ARCHITECTURE.md`
(the four-deployable migration). This document sequences the work.

## Sequencing rationale

Domain logic (Settlement, FMCG, Hospital) ships **before** the four-app
re-architecture, not after — building new business surface once, on the
currently-stable, currently-deployed monolith, then re-platforming a more
complete system once, is cheaper and lower-risk than re-platforming a
smaller surface now and then building new features across four
newly-split apps with more moving parts and less-proven deployment
topology. This matches the master prompt's own Section 26 instinct
("reversible changes over risky migrations") and this project's entire
track record so far (every one of the 15 ENTERPRISE stages shipped this
way: smallest safe increment, live-verified, then the next one).

Each stage below follows the same discipline every prior stage in this
project has used: schema migration → service layer → API → UI →
automated tests → full validation gate → Docker rebuild/redeploy → live
verification against the real running app → commit.

## EXPANSION-0 — Discovery & baseline (this document set)

**Status: complete.** `EXPANSION-GAP-ANALYSIS.md`,
`EXPANSION-DOMAIN-MODEL.md`, `EXPANSION-TARGET-ARCHITECTURE.md`, this
plan. No application code touched.

## EXPANSION-1 — Settlement engine

**Scope**: `PartnerFeeTerm`, `Commission`, `Payout`, `Settlement`,
`Reconciliation` models. Service layer: fee computation triggered when a
consultation/diagnostic-order/medicine-order-item/Panchakarma-booking
reaches its completed/eligible state (reusing the existing status
transitions already in place — no new "completion" concept invented, just
a hook off the existing ones). Admin UI: fee-term configuration (mirrors
ENTERPRISE-7's GST-rate-config pattern), a settlement-cycle console
(open → lock → generate payouts → mark paid), a reconciliation view.
Partner-facing UI: an earnings/payout history view added to Doctor, Lab,
Pharmacy, and Panchakarma Centre portals (each portal already has an
overview dashboard this slots into, matching ENTERPRISE-14's "extend the
existing dashboard" pattern rather than a new page per portal).

**Database changes**: 5 new models, additive, zero interaction with
existing tables besides read-only references to `Payment`.

**Out of scope for this stage, flagged in the gap analysis**: refund/
clawback treatment for an already-paid-out commission (accounting
decision, not engineering).

## EXPANSION-2 — FMCG catalogue

**Scope**: `Medicine.isFmcg` boolean. Admin catalogue view filtered to
FMCG items (a tab on the existing Pharmacy inventory manager or a filter
on the public medicines admin, whichever the existing UI naturally
extends). Public storefront: an "FMCG" section on `/medicines` querying
`searchPublic({ isFmcg: true })`. No new supplier, inventory, or
fulfilment logic — reuses `PharmacyInventory`/`MedicineOrder` unchanged.

**Database changes**: 1 additive boolean field.

## EXPANSION-3 — Inpatient hospital module

**Scope**: `HospitalFacility`, `HospitalWard`, `HospitalBed`,
`HospitalAdmission`, `HospitalBedTransfer`, `HospitalRoundNote`,
`HospitalDischargeSummary`. Management UI: facility/ward/bed setup
(admin), an admission board (bed occupancy by ward, admit/discharge/
transfer actions) — this is the "Hospital Operations" screen the master
prompt's Section 8.5 names. Doctor-facing UI: an admitted-patients list
on the Doctor portal, a rounds-note composer, a discharge-summary
composer. Patient-facing UI: admission appears in the patient's health
record/timeline once discharged (read-only, matching how prescriptions
and diagnostic reports already surface).

**Database changes**: 7 new models, additive. `Admission` links to the
existing `User`/`DoctorProfile` — no changes to either.

**Explicitly deferred, per the domain-model doc's own scope line**:
medication-administration-record charting, nursing shift notes, order
sets, and bed-charge billing. These need real clinical/billing rules
defined before they're built, not invented here.

## EXPANSION-4 — Four-app migration

**Scope**: exactly what `EXPANSION-TARGET-ARCHITECTURE.md` specifies —
workspace conversion, `packages/domain` + `packages/design-system`
extraction, four thin Next.js apps, Nginx path-prefix routing, Docker
Compose updated to four app services. Every portal gets smoke-tested
against the new topology before the single-app deployment is retired.

**This is the highest-risk stage in the whole expansion.** Recommended
approach: build it on a separate branch/worktree, keep the current
single-app deployment live and serving traffic throughout, cut over only
after every portal passes the same live-verification discipline every
other stage in this project has used — never a big-bang replace.

## EXPANSION-5 — Final QA, security, and responsive pass

**Scope**: repeats ENTERPRISE-15's own methodology (screenshot pass at
three breakpoints, live E2E verification, keyboard-only accessibility
check, OWASP-style security review) — scoped to what EXPANSION-1 through
4 actually added: the Settlement engine's financial-calculation
correctness (deterministic server-side tests, per the master prompt's own
Rule 14 on financial invariants), the Hospital module's authorization
boundaries (a doctor must not see another facility's admissions without
cause), and the four-app migration's session/routing behavior under the
new Nginx topology specifically (the one thing that can't be verified
until the migration itself is live).

## What this plan does not include

- Kubernetes/Argo/Tekton — explicitly out of scope per the master
  prompt's own header.
- A second hospital facility, MAR/nursing charting, bed-charge billing —
  named as future work in the domain-model doc, not built speculatively.
- Real GST/accounting sign-off on any new fee percentages — a business
  decision, same standing caveat as ENTERPRISE-7's GST rate table.

## Next step

This plan is ready for review. Per the master prompt's own Phase 0 gate
("migration strategy approved by Orchestrator") and this project's
standing practice of confirming before large, hard-to-reverse changes,
EXPANSION-1 (Settlement) starts on explicit go-ahead — it's the lowest-
risk, most clearly-grounded stage, and doesn't block on anything else in
this plan.
