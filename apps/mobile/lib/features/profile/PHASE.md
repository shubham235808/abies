# profile

Phase 2 — implemented (unverified, see apps/mobile/README.md "Status"): view/edit patient profile,
add/delete family members, view and withdraw consent. All against real existing endpoints
(`/api/v1/patients/me`, `/api/v1/patients/me/family`, `/api/v1/consent/*`) — no new backend work.

Not done: address book beyond the single address on `PatientProfile`, notification preferences (that's
the notifications feature, Phase 9), editing a family member (only add/delete so far — `PATCH
/api/v1/patients/me/family/[id]` exists and `ProfileApi.updateFamilyMember` wraps it, just not wired to
a screen yet).
