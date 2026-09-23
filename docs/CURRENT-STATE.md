# Current State

Snapshot as of 2026-09-23. See `docs/DECISIONS.md` for how conflicts in the
source material were resolved.

## Repository

The working tree is empty except for this documentation pass and the
knowledge pack. `main` is at commit `d1b86ac` ("reinit"), which deleted a
prior prototype. That prototype is **not** part of this build (D1) — it lived
at `abies-platform/` in commits `d23643d`/`6af83c3` and was a plain
Express + vanilla-JS backend deployed via Helm/K3s/ArgoCD, architecturally
unrelated to the Next.js modular monolith this project targets.

## Knowledge pack

`ABIES_Agent_Knowledge_Pack/` (untracked, provided 2026-09-23) contains:

| File | Role |
|---|---|
| `01_Product/*Enhanced_Blueprint.docx` | Authoritative product/business spec |
| `01_Product/*Product_Blueprint.docx` | Superseded draft of the above (D2) |
| `02_Presentations/*IT_Stack_Presentation.pptx` | Authoritative target architecture |
| `02_Presentations/*Presentation.pptx` | Superseded draft business deck (D2) |
| `03_Sprints/ABIES_Ayurveda_Sprint2.zip` | Validated identity/auth/RBAC baseline (NestJS) |
| `03_Sprints/ABIES_Ayurveda_Sprint3.zip` | Validated doctor onboarding + discovery (NestJS) — latest implemented snapshot |
| `04_Prototype/ABIES_Ayurveda_Website_Prototype_v1.zip` | Static HTML/CSS visual reference only |
| `05_Brand/ABIES_logo.jpg` | Brand asset |

## What is actually validated and working (Sprint 2 + Sprint 3)

Stack: NestJS (TypeScript) + Prisma + PostgreSQL 16, static HTML/CSS/JS
frontend, Nginx reverse proxy, single-container Docker Compose deployment.
This is **not** the target frontend stack (no Next.js/React yet) but the
backend domain logic and data model are real, tested (`SPRINT3_TEST_PLAN.md`),
and treated as the validated behavioral baseline (D3).

### Identity & access (Sprint 2)
- Mobile OTP login (`+91` normalization, HMAC-peppered hash, cooldown, max
  attempts, dev-mode bypass code).
- Role-gated account provisioning: patients self-register on first OTP
  verify; other roles require admin provisioning or (doctors only) a feature
  flag `ALLOW_DOCTOR_SELF_ONBOARDING`.
- Cookie-free bearer session model: hashed refresh tokens, sliding refresh,
  JWT access tokens carrying `sub`, `role`, `sid`, `mfa`.
- Admin MFA gate (`ADMIN_MFA_REQUIRED`), dev-only static code, explicitly
  disabled in production pending a real provider.
- Consent artifacts (`ConsentArtifact`/`ConsentRecord`) auto-accepted on OTP
  verification for all active+required artifacts; consent history queryable.
- Immutable `AuditEvent` log with actor, event type, resource, action,
  request metadata.
- Patient profile + family members (`PatientProfile`, `FamilyMember`) CRUD.

### Doctor onboarding & discovery (Sprint 3, builds on Sprint 2)
- Doctor professional profile: registration council/number, qualifications,
  experience, specialties, languages, consultation modes, per-mode fees.
- Private credential document upload (PDF/JPG/PNG only) with per-document
  verification status.
- Clinic locations (multi-clinic support) and recurring weekly availability,
  constrained to consultation modes enabled on the profile.
- Full verification lifecycle: `DRAFT → SUBMITTED → UNDER_REVIEW → APPROVED`,
  with `REJECTED`/`SUSPENDED`; edit-lock outside `DRAFT`/`REJECTED`;
  submission checklist; approval requires both mandatory documents
  `VERIFIED`. Every transition and document review is audited.
- Public discovery API: search/filter by query, city, specialty, language,
  consultation mode; only `APPROVED` + `isDiscoverable` doctors are returned;
  credential files are never exposed publicly.

### Explicitly out of scope of Sprint 2/3 (per Sprint 3 README)
"Appointment inventory, booking transactions, payment and consultation
lifecycle are intentionally left for Sprint 4" — i.e., everything from
appointments onward (consultations, prescriptions, care plans, diagnostics,
medicines/pharmacy, Panchakarma, payments, support CRM, sales, care
coordination, notifications) has **no implementation to reference**. Those
modules are designed from the Enhanced Blueprint alone.

## Known caveats to carry forward
- Sprint 3 demo clinic postal codes are placeholders (D4) — new seed data
  must use real, consistent city/state/PIN data.
- Dev OTP/MFA bypass codes exist only for non-production `NODE_ENV`; the
  production MFA path was never implemented (explicitly throws).
- Frontend is static HTML/vanilla JS, not React/Next.js — no UI code is
  reused, only the API contract and validation rules it drives.

## Gap to target state

Everything in `docs/TARGET-ARCHITECTURE.md` and `docs/DOMAIN-MODEL.md` beyond
the "validated" section above is net-new: the entire Next.js modular-monolith
scaffold, 9 of 10 portals, the public website, appointments/payments/video,
consultations/prescriptions, the Care Plan engine, diagnostics, medicines/
pharmacy, Panchakarma, support/sales/care-coordination CRM, notifications,
observability, backup/CI-CD, and all associated tests.
