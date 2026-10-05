# Architecture & Product Decisions Log

Records decisions made when source material conflicted or was ambiguous, per the
rule in `ABIES_Agent_Knowledge_Pack/00_READ_ME_FIRST.md`: prefer the most recent
document, then validated behavior over old prototype behavior, then healthcare
safety over convenience.

## D1 — Prior Express/Helm prototype is not a build input
**Date:** 2026-09-23
**Decision:** The `reinit` commit removed a prior Express + Helm/K3s/ArgoCD
prototype (`abies-platform/`) from the working tree; it remains only in git
history (commits `d23643d`, `6af83c3`). Per explicit user instruction, this code
is ignored entirely. It is architecturally unrelated to the target stack
(plain Express vs. Next.js modular monolith; Helm/K3s/ArgoCD vs. Docker
Compose/Nginx on a single Ubuntu VM) and is not referenced for domain rules.
**Why:** User confirmed a clean-slate build; salvaging it would import a
different architecture's assumptions into the new system.

## D2 — Source document precedence
**Date:** 2026-09-23
**Decision:** Followed `SOURCE_INDEX.md`'s stated priority order:
1. `ABIES_Ayurveda_Integrated_Care_Platform_Enhanced_Blueprint.docx`
2. `ABIES_Ayurveda_Sprint3.zip` (latest validated implementation)
3. `ABIES_Ayurveda_Sprint2.zip` (identity/auth/RBAC baseline)
4. `ABIES_Ayurveda_Platform_IT_Stack_Presentation.pptx`
5. `ABIES_Ayurveda_Integrated_Care_Platform_Presentation.pptx`
6. `ABIES_Ayurveda_Integrated_Care_Platform_Product_Blueprint.docx`
7. `ABIES_Ayurveda_Website_Prototype_v1.zip` (visual reference only)

Inspection confirmed items 6 and 5 are earlier drafts of items 1 and 4
respectively (near-identical section structure and content, missing the
enhanced blueprint's Sections 27–30 on Support/Sales/TechOps and Delivery
Governance). They were not separately mined for requirements beyond
confirming this — the enhanced versions supersede them per the stated rule.
**Why:** Avoids re-deriving conflicting requirements from a document the
index itself says is superseded.

## D3 — Sprint 2/3 NestJS implementation is the validated behavioral baseline
**Date:** 2026-09-23
**Decision:** The business rules encoded in the Sprint 3 NestJS/Prisma backend
are treated as authoritative validated behavior and are ported (re-implemented
in the Next.js modular monolith's service layer), not discarded or silently
changed. Specifically preserved:
- Mobile OTP normalization (`+91` + 10-digit, `[6-9]` leading digit), HMAC-peppered
  OTP hash, cooldown, max attempts, dev-mode OTP bypass gated on `NODE_ENV`.
- Role-scoped account provisioning: only `PATIENT` self-registers freely on
  first OTP verify; every other role is provisioned by an ops admin in the ops
  portal (`/api/v1/admin/staff`), which covers the staff roles and the partner
  roles (DOCTOR, LAB, PHARMACY, PANCHAKARMA_CENTRE). The `ALLOW_*_SELF_ONBOARDING`
  flags default to `false` (updated 2026-10-05: access to partner portals is
  granted from the ops portal, not self-onboarding).
- Session model: refresh token stored as SHA-256 hash only, sliding refresh,
  `mfaVerified` flag gates admin access to privileged actions.
- Admin MFA required by default (`ADMIN_MFA_REQUIRED`), dev-only static code
  path explicitly forbidden in production (`NODE_ENV === 'production'` throws).
- Consent artifacts auto-recorded (accept) for all active+required artifacts
  on every successful OTP verification.
- Doctor verification lifecycle: `DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED`,
  with `REJECTED`/`SUSPENDED` side states. Profile/document edits are locked
  outside `DRAFT`/`REJECTED`. Re-editing a `REJECTED` profile resets it to
  `DRAFT` and clears the rejection reason.
- Submission checklist (name, registration council/number, primary
  qualification, years experience, ≥1 specialty, ≥1 language, ≥1 consultation
  mode, fee for each enabled mode, registration certificate + degree
  certificate uploaded) enforced server-side before allowing `SUBMITTED`.
- Approval requires **both** the registration certificate and degree
  certificate to individually carry document status `VERIFIED`.
- Availability slots may only use a consultation mode (`VIDEO`/`CLINIC`) that
  is already enabled on the doctor's profile.
- Public discovery returns a doctor only when
  `verificationStatus = APPROVED AND isDiscoverable = true`; `isDiscoverable`
  is force-cleared on submit/review/reject/suspend and only set true on
  approval.
- Every doctor verification transition and document review writes an
  immutable `DoctorVerificationAction` / `AuditEvent` row with actor, from/to
  status, and notes.
**Why:** These rules were implemented, exercised via `SPRINT3_TEST_PLAN.md`,
and are the closest thing this project has to a proven spec. Re-deriving them
from the prose blueprint alone risks silently dropping edge cases (e.g., the
re-submission-resets-to-DRAFT rule, or the dual-document VERIFIED-before-approve
gate) that only exist in the code.

## D4 — Seed data postal codes will be corrected
**Date:** 2026-09-23
**Decision:** Per the knowledge pack's own caveat, Sprint 3's demo clinic
postal codes are placeholders. New seed data must use real, internally
consistent city/state/PIN combinations.
**Why:** Explicit caveat in `00_READ_ME_FIRST.md`.

## D5 — Delivery shape: phased sessions, not one unattended run
**Date:** 2026-09-23
**Decision:** Given the scope (10 portals, full clinical/commerce/support
domain, production security posture), the build proceeds phase-by-phase
across sessions per `docs/IMPLEMENTATION-PLAN.md`, using the Workflow tool for
multi-agent execution within a phase where useful. Foundational documents
(this set) are reviewed with the user before large-scale code generation
begins, since domain-model errors are expensive to unwind once dozens of
files depend on them.
**Why:** User explicitly opted into Workflow-based multi-agent orchestration,
but a system handling health data warrants a checkpoint on the domain model
before committing significant generated code to it.

## D6 — Backend runtime: Next.js route handlers/server actions replace NestJS
**Date:** 2026-09-23
**Decision:** Sprint 2/3's NestJS backend is a reference for behavior, not
runtime code to keep. The target stack (per the Enhanced Blueprint's Reference
Technical Architecture and the IT Stack deck) is explicitly a Next.js modular
monolith. NestJS's guards/interceptors/services map to: Next.js middleware +
a shared `lib/auth` session/RBAC helper (guards), a shared `lib/audit` logger
called from server actions/route handlers (interceptor), and per-module
`services/` files under `modules/*` (services). Prisma schema and migration
history restart cleanly in the new repo rather than importing Sprint 3's
migration files, since the new schema is a superset with different module
boundaries.
**Why:** Matches the mandatory technology stack and repository structure
specified for this build; avoids running two backend frameworks.

## D7 — Dependency versions: latest stable major, not always the newest major
**Date:** 2026-09-23
**Decision:** Phase 0 dependencies were pinned by checking the npm registry
directly (`npm view <pkg> version` / `dist-tags`) rather than guessing, since
training-data knowledge of package versions is stale by this project's
timeframe. `npm audit` on the initial install found real critical CVEs in
Next.js 14 with a fix path requiring Next 16, so the stack was upgraded
across the board rather than left on a known-vulnerable major:
- **Next.js 16 + React 19** (not 14/18) — `npm audit` flagged multiple
  critical/high CVEs in Next 14 with no patch release on that major.
- **Prisma 7, `latest` dist-tag** (not the `8.0.0-rc.x` `next`-adjacent tag
  that showed up as "latest" in one query) — an RC has no place in a
  healthcare app's dependency tree. Prisma 7 also removed the Rust query
  engine and requires an explicit driver adapter (`@prisma/adapter-pg`) and
  a `prisma.config.ts` for the CLI, instead of a `url` in `schema.prisma`'s
  `datasource` block — `src/lib/db.ts`, `prisma/seed.ts`, and
  `prisma.config.ts` all reflect this.
- **Tailwind CSS 4** (not 3) — CSS-first config via `@theme` in
  `src/app/globals.css` replaces `tailwind.config.ts`, which Tailwind 4
  removed as the primary configuration path.
- **ESLint 9.x, deliberately not 10.x** — `eslint-config-next@16` only
  requires `eslint >=9.0.0`; ESLint 10 with the currently-published
  `typescript-eslint@8.70.1` threw a `scopeManager.addGlobals is not a
  function` internal error (a real incompatibility, not a config mistake —
  reproduced and confirmed by downgrading fixed it). Given the ecosystem's
  own stated floor is 9, not 10, this is the safer choice, not a stale one.
- **TypeScript 5.9.x, deliberately not 7.0** — TypeScript 7 is a ground-up
  native (non-JS) compiler rewrite that just became `latest` on the
  registry; `typescript-eslint` and other tightly-coupled tooling are far
  more likely to have caught up with a routine 5.x point release than a
  same-generation rewrite. Revisit once the ecosystem (`typescript-eslint`,
  `tsx`) publishes versions explicitly targeting TS 7.
- **`eslint-config-next`'s flat config is imported directly**
  (`import nextConfig from 'eslint-config-next'`), not via
  `FlatCompat.extends('next/core-web-vitals')` — the package now ships
  native flat-config arrays, and running them through the legacy
  `@eslint/eslintrc` compatibility shim threw a circular-JSON error on the
  `react` plugin object. `eslint.config.mjs` reflects the direct-import form.
**Why:** A production healthcare app shouldn't launch Phase 0 with known
critical CVEs or a release-candidate ORM in its dependency tree, but
"newest available major" and "safe to use" aren't the same thing — each
upgrade above was verified against `npm audit` output or a reproduced local
failure, not assumed. Environment note: dependency versions really do drift
between when this decision is read and when the registry is queried again —
re-run `npm view <pkg> version` before assuming any pin here is still
current.
