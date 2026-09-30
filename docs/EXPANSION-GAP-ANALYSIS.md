# Expansion Gap Analysis — Settlement Engine, Inpatient Hospital, FMCG Catalogue, Multi-App Architecture

Source: `ABIES-AGENTIC-DEVELOPMENT-MASTER-PROMPT.md` (user-supplied), cross-
checked against `ABIES_Agent_Knowledge_Pack/` — the actual source-of-truth
material this platform was originally built from (its own
`00_READ_ME_FIRST.md` names the Enhanced Product Blueprint as the #1
priority source). Per the master prompt's own Section 24 (Stop
Conditions: "conflicting authoritative source documents"), this document
records where the new master prompt's scope agrees with, extends, or
conflicts with that blueprint, and the three decisions the user made
directly when asked.

## What's already built (not re-litigated here)

The current application — a single Next.js 16 App Router modular
monolith — already implements the substantial majority of the master
prompt's Sections 8.2–8.5 (client/doctor/partner/management screens) and
Section 9 (Journeys A, C, D, E, F, G, H, I) through two prior efforts:

1. 12 backend phases + UX-0 through UX-12 (`docs/IMPLEMENTATION-PLAN.md`,
   `docs/UI-REDESIGN-PLAN.md`) — the original build.
2. ENTERPRISE-0 through ENTERPRISE-15 (`docs/ENTERPRISE-IMPLEMENTATION-PLAN.md`)
   — diagnostic packages, promotions, Pharmacy POS/GST, a permissions
   layer, Technical Support incident tracking, per-role reporting, and a
   final security/accessibility/responsive QA pass.

Eleven role-specific portals exist today (Public, Patient, Doctor, Lab,
Pharmacy, Panchakarma Centre, Customer Support, Technical Support, Sales,
Care Coordinator, Admin), all live-verified and deployed. This document
covers only the delta the new master prompt adds on top of that.

## Classification

| Master-prompt item | Blueprint-grounded? | Classification | Notes |
|---|---|---|---|
| Settlement / Commission / Payout / Reconciliation (§11 Finance, §17) | **Yes** — Enhanced Blueprint §19 names `Payment, Fee, Commission, Payout, Settlement, Reconciliation` as core entities; §10 (Admin journey) and §17 (Business Model) both describe partner commercial terms and payout cycles | **NEW_CAPABILITY_REQUIRED** | Nothing in the current schema models this — `Payment`/`Refund` exist, a settlement/payout concept does not. User confirmed: build it. |
| Hospital operations — full inpatient (admissions, beds/wards, discharge) (§8.5, Journey B) | **No** — zero mentions of "hospital", "admission", "ward", or "bed" anywhere in the Enhanced Blueprint, the Product Blueprint, or either presentation. The blueprint's provider network is a distributed partner marketplace (independent clinics/centres/labs/pharmacies), not a vertically-integrated hospital. | **NEW_CAPABILITY_REQUIRED**, explicitly out-of-blueprint | User confirmed: build the full inpatient model anyway. Scope assumptions below need sign-off since nothing authoritative defines them. |
| FMCG as an admin-managed catalogue (§1, §8.5) | **Partially** — ABIES's own baby-care/OTC line already exists as ordinary `Medicine` rows (see `prisma/seed.ts`'s `ABIES_MEDICINES`), fulfilled through the existing Pharmacy/order infrastructure. The blueprint never separates "FMCG" from medicine commerce. | **BACKEND_EXT** (small) | User confirmed: same products, same fulfilment path, just a distinct catalogue/category and its own admin view + storefront section. Not a new supplier/inventory model. |
| 4-app split (`client-web`/`management-web`/`partner-web`/`platform-api` + `packages/` + `workers/`) (§7) | **Contradicts** — Enhanced Blueprint §18 explicitly recommends: "begin as a well-structured modular monolith or limited service set, then split services only where scale/ownership justifies it." The IT Stack presentation's own NestJS-multi-service proposal was already superseded once, per the knowledge pack's own README ("The new target is a complete Next.js modular monolith"). | User-directed, explicit override | User confirmed: do the re-architecture anyway. This is the largest, highest-risk single item in this whole expansion — see `docs/EXPANSION-TARGET-ARCHITECTURE.md` for the migration strategy and risk. |
| Client / Clinical & Partner / Management three-experience split (§1) | Consistent with existing role separation, just regrouped | **UI_REDESIGN**, mechanical | Maps cleanly onto the 11 existing portals — see architecture doc. |
| Kubernetes-readiness prep (§27) | Consistent with blueprint's own "then split services only where scale/ownership justifies it" | **BACKEND_EXT**, deferred | Prepare (env-config, health/readiness endpoints, statelessness), do not implement K8s/Argo/Tekton — matches the master prompt's own explicit exclusion in its header. |
| 14-role formal agent-orchestration methodology (§4–5) | N/A — a process framework, not a product requirement | Adopted as a **planning lens**, not literal subagent spawning | This session executes the work directly (matching the discipline already proven across 15 ENTERPRISE stages: schema → service → API → UI → tests → deploy → live-verify → commit), reasoning through each specialist role's concerns rather than spawning 14 separate agents. Multi-agent orchestration tooling is available but reserved for cases the user explicitly opts into. |

## Decisions requiring explicit sign-off before implementation

These are recorded here, per the master prompt's own Section 10 ("No
silent requirement changes. Record ambiguities and decisions"), not
resolved unilaterally:

1. **Hospital facility scope**: is this a single ABIES-operated facility,
   or multiple? This document assumes **one facility to start**
   (`HospitalFacility` modelled as a table regardless, so a second
   facility is additive later, not a rebuild) with departments/wards/beds
   underneath it. If ABIES operates or plans multiple physical hospitals
   from day one, the admission/bed model needs a facility-scoping pass
   before building.
2. **Inpatient clinical scope for the MVP**: per the master prompt's own
   "no clinical invention" rule (Rule 11), this plan limits the first
   inpatient build to what's structurally unambiguous — admission, ward/
   bed assignment and transfer, attending-doctor rounds notes, and a
   discharge summary. It deliberately does **not** invent medication-
   administration-record (MAR) workflows, nursing shift charting, order
   sets, or bed-charge billing rules, since none of those are defined by
   any approved source. These are named as explicit follow-on gaps, not
   built speculatively.
3. **FMCG catalogue boundary**: this plan treats "FMCG" as a `Medicine`
   category/channel flag (`category: 'FMCG'` alongside the existing
   Ayurvedic/OTC categories already in use), not a new top-level entity.
   If ABIES needs FMCG products to bypass prescription/pharmacist-review
   rules that apply to other medicines, that's a distinct rule to define
   before building, not assumed here.
4. **Multi-app migration order**: recommended sequencing is in
   `docs/EXPANSION-IMPLEMENTATION-PLAN.md` — build Settlement, Hospital,
   and FMCG on the current working monolith first (lower risk, ships
   business value immediately, keeps the live app deployable throughout),
   then perform the 4-app extraction once that surface is stable, rather
   than re-platforming twice. This is a recommendation, not a decision
   made unilaterally — confirm before Phase 1 starts.

## What this document deliberately does not do

Per the master prompt's own Phase 0 gate ("No feature coding until
complete"), no schema, service, or UI code changes accompany this
document. `docs/EXPANSION-DOMAIN-MODEL.md`,
`docs/EXPANSION-TARGET-ARCHITECTURE.md`, and
`docs/EXPANSION-IMPLEMENTATION-PLAN.md` complete the required Phase 0
deliverable set; implementation begins only after these are reviewed.
