# ABIES Ayurveda Care Platform — Agent Knowledge Pack

This package contains the source material for the complete ABIES Ayurveda Care Platform build.

## Source priority

Use the sources in this order when they conflict:

1. `01_Product/ABIES_Ayurveda_Integrated_Care_Platform_Enhanced_Blueprint.docx`
2. `03_Sprints/ABIES_Ayurveda_Sprint3.zip` — latest implemented/validated application snapshot
3. `03_Sprints/ABIES_Ayurveda_Sprint2.zip` — identity/auth/RBAC baseline
4. `02_Presentations/ABIES_Ayurveda_Platform_IT_Stack_Presentation.pptx`
5. `02_Presentations/ABIES_Ayurveda_Integrated_Care_Platform_Presentation.pptx`
6. `01_Product/ABIES_Ayurveda_Integrated_Care_Platform_Product_Blueprint.docx`
7. `04_Prototype/ABIES_Ayurveda_Website_Prototype_v1.zip` — visual/reference prototype only

## Important implementation context

The currently validated implementation through Sprint 3 includes:

- OTP authentication
- cookie-based sessions
- RBAC
- admin MFA
- patient profile and family members
- consent/audit baseline
- doctor onboarding
- doctor credentials
- clinics
- doctor availability
- admin doctor verification
- approval/rejection/suspension workflow
- public doctor discovery and filters
- PostgreSQL + Prisma
- NestJS backend
- Nginx reverse proxy
- Docker Compose deployment

The new target is a complete **Next.js modular monolith**. The current Sprint 3 implementation is a reference source for working domain behavior and validated workflows; do not discard those rules without documenting why.

## Known validated behaviors

- Only approved/discoverable doctors appear in public search.
- Public doctor filtering works by city, language, specialty, and consultation mode.
- Doctor availability modes should only allow consultation modes enabled on the professional profile.
- `VIDEO` and `CLINIC` are distinct doctor consultation modes.
- Admin approval and privileged actions require authorization and MFA as defined in the source.
- Diagnostics bookings and reports are separate concepts.
- The Care Plan is the central orchestration concept for consultation, diagnostics, medicines, Panchakarma, lifestyle, and follow-up.

## Known seed-data caveat

Some Sprint 3 demonstration clinic postal codes are placeholders and should be corrected in the new development seed data.

## First tasks for the coding agent

Before major implementation:

1. Read every document and archive in this pack.
2. Extract Sprint 2 and Sprint 3 source snapshots.
3. Inspect the latest Prisma schema, migrations, APIs, and UI.
4. Create:
   - `docs/CURRENT-STATE.md`
   - `docs/TARGET-ARCHITECTURE.md`
   - `docs/DOMAIN-MODEL.md`
   - `docs/IMPLEMENTATION-PLAN.md`
   - `docs/IMPLEMENTATION-STATUS.md`
5. Preserve the validated workflows while migrating to the target Next.js modular-monolith architecture.

Do not treat the old static prototype as the final domain model.
