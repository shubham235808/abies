# prescriptions

Implemented in Phase 7 of `docs/mobile/IMPLEMENTATION-PLAN.md`: "My prescriptions" and the real
"purchase from a finalized prescription" flow. The pharmacy catalogue/cart/order screens this flow ends
in live in the sibling `lib/features/pharmacy/` feature — see its own `PHASE.md`.

## Endpoints consumed

- `GET /api/v1/patients/me/prescriptions` — `listFinalizedPrescriptionsForPatient()`, already confirmed
  patient-accessible, finalized-only.
- `GET /api/v1/prescriptions/[id]/match?pharmacyId=` — `matchPrescriptionAtPharmacy()`, already confirmed
  patient-accessible.
- `GET /api/v1/public/pharmacies` (via `lib/features/pharmacy/data/pharmacy_api.dart`'s `PharmacyApi.
  listPharmacies`) — the pharmacy-picker.
- `POST /api/v1/medicine-orders` (via `PharmacyApi.bookOrder`) — see "the real purchase path" below.

## Real gap found — there is no single-prescription `GET` at all

`apps/platform-api/src/app/api/v1/prescriptions/[id]/route.ts` exports **only** a `PATCH` handler
(`requireRole(ctx, 'DOCTOR')`, for `updatePrescription()`) — confirmed by reading that file directly.
Unlike Phase 6's two doctor-only diagnostic-recommendation routes (which *do* exist and are simply
unreachable for a patient), there is no doctor-only `GET` being worked around here either — **there is
no `GET` handler of any kind on that route**. This app never calls it and never builds a screen around a
call that doesn't exist.

Since `listFinalizedPrescriptionsForPatient()`'s own per-row shape already carries every item field this
app needs (`dosage`, `frequency`, `durationDays`, `route`, `instructions`, `startDate`/`endDate`,
`doctorNotes`, the doctor's name), `PrescriptionDetailScreen` reads its object via `GoRouter` `extra` —
the exact row the list screen already fetched — never a network call that doesn't exist. Opened cold, it
shows an honest "start from My prescriptions" state, same already-known pattern as Panchakarma/
Diagnostics/medicines' own detail-via-extra screens.

**Suggested backend follow-up**: a `GET /api/v1/prescriptions/[id]` with `requireRole(ctx, 'PATIENT',
'DOCTOR')` (scoped to the prescription's own `patientUserId`/`doctorProfileId`, same ownership check
`getOrder()` uses for medicine orders) would make this a real cold deep link.

## No prescription document — nothing to view or download

`Prescription` in `packages/domain/prisma/schema.prisma` has **no storage-key/document field of any
kind** — confirmed by reading the full model. Unlike a `DiagnosticOrder`'s `DiagnosticReport` (which has
a real `Report` row behind it, reachable through `GET /api/v1/reports/[id]/download`'s signed-URL
pattern per SECURITY-DESIGN.md §8), a `Prescription` is pure structured data (medicine name, dosage,
frequency, instructions, ...) with nothing else attached. This app shows exactly those structured fields
and does not build a document viewer for a file that doesn't exist — reported here rather than silently
worked around.

## The real purchase-from-prescription path

Per `lib/features/pharmacy/PHASE.md`'s "two genuinely separate purchase paths" section: `addToCart()`
rejects every `requiresPrescription` medicine outright, so a matched item is never addable to a cart.
`PrescriptionPurchaseController` instead calls `PharmacyApi.bookOrder()` — `POST /api/v1/medicine-orders`
directly, confirmed `requireRole(ctx, 'PATIENT')` — with this prescription's id and the chosen matched
items' `medicineId`/quantity. `bookOrder()`'s own validation (`packages/domain/src/modules/medicines/
orders.service.ts`) is what's authoritative for "does this medicine actually require, and have, a
matching prescription item" — this app's UI only ever informs/warns, never gates client-side in a way
that could be bypassed (brief §10).

**A real, inherited gap this purchase flow surfaces rather than works around**: `matchPrescriptionAtPharmacy()`
aggregates a prescription item's availability **by `medicineId` only**, with no variant granularity —
read directly from that function's `Map<string, {...}>` keyed by `medicineId`. If a prescribed medicine
actually has `MedicineVariant` rows (EXPANSION-1 pack sizes), the match result can say "available" while
`bookOrder()`'s own FEFO batch lookup (which *does* filter by `variantId ?? null`) fails to find a
non-variant batch to fulfil it, since this flow never has a variant to pass. This app always calls
`bookOrder` with no `variantId` for a prescription purchase, matching what `matchPrescriptionAtPharmacy`
itself is capable of resolving — a real limitation in the backend's own match/book interaction, not
something this phase's mobile code can fix without touching backend code (out of scope per this phase's
brief). Flagging it here rather than re-litigating it as a new discovery to invent a workaround for.

## Re-fetch-before-commit discipline

`PrescriptionPurchaseController.confirmPurchase` always re-runs the real match call
(`matchAtPharmacy()`) immediately before calling `bookOrder`, and refuses to include any selected item
the fresh match no longer reports available (or in enough quantity) — the same "never trust an earlier
fetch at the moment of commit" rule every prior phase's booking flow enforces, applied here to the
match result rather than a slot/therapy/test's existence.
