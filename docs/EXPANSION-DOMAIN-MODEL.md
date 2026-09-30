# Expansion Domain Model — Settlement, Hospital, FMCG

Companion to `docs/EXPANSION-GAP-ANALYSIS.md`. Sketches the new Prisma
entities before any migration is written, following this project's
established discipline (schema decisions get written down and reviewed
before `prisma migrate dev` runs). Field names and conventions match the
existing schema's own patterns throughout — polymorphic references as
plain strings (`Payment.purposeEntityId`'s convention), money as `Int`
rupees (never a float), audit via `recordAuditEvent`, ownership scoping
by the acting user's own profile, never a client-supplied tenant id.

## 1. Settlement domain (backs Enhanced Blueprint §19: `Fee, Commission, Payout, Settlement, Reconciliation`)

```prisma
enum PartnerKind {
  DOCTOR
  DIAGNOSTIC_LAB
  PHARMACY
  PANCHAKARMA_CENTRE
}

enum FeeModel {
  PERCENTAGE
  FIXED
}

// One row per (partner, service-line, effective period) — mirrors how
// GstRateConfig is admin-configurable rather than hardcoded (ENTERPRISE-7's
// own precedent), since blueprint §17's guardrail is explicit: commercial
// terms must not be assumed as fact.
model PartnerFeeTerm {
  id             String      @id @default(cuid())
  partnerKind    PartnerKind
  partnerId      String      // DoctorProfile.id | DiagnosticLab.id | Pharmacy.id | PanchakarmaCentre.id
  feeModel       FeeModel
  rateBasisPoints Int?       // PERCENTAGE: e.g. 1500 = 15.00%
  fixedAmount    Int?        // FIXED: rupees
  effectiveFrom  DateTime
  effectiveTo    DateTime?
  active         Boolean     @default(true)
  createdByUserId String
  createdAt      DateTime    @default(now())
  updatedAt      DateTime    @updatedAt

  @@index([partnerKind, partnerId, effectiveFrom])
}

enum CommissionStatus {
  PENDING       // transaction completed, fee computed, not yet in a payout
  INCLUDED      // pulled into a Payout
  REVERSED      // source transaction later refunded/cancelled
}

// One row per fee-eligible completed transaction (a COMPLETED consultation,
// a COMPLETED diagnostic order, a DELIVERED medicine order line, a
// COMPLETED Panchakarma booking) — computed once, snapshotting the
// PartnerFeeTerm that applied, so a later rate change never rewrites
// history (same "taxRate snapshot on PhysicalSaleItem" precedent from
// ENTERPRISE-7).
model Commission {
  id              String            @id @default(cuid())
  partnerKind     PartnerKind
  partnerId       String
  sourcePaymentId String            // Payment.id the gross amount came from
  grossAmount     Int
  feeAmount       Int               // platform's share
  payableAmount   Int               // partner's share = grossAmount - feeAmount
  feeTermId       String?
  status          CommissionStatus  @default(PENDING)
  payoutId        String?
  createdAt       DateTime          @default(now())

  sourcePayment   Payment           @relation(fields: [sourcePaymentId], references: [id], onDelete: Restrict)
  feeTerm         PartnerFeeTerm?   @relation(fields: [feeTermId], references: [id], onDelete: SetNull)
  payout          Payout?           @relation(fields: [payoutId], references: [id], onDelete: SetNull)

  @@index([partnerKind, partnerId, status])
  @@index([payoutId])
}

enum PayoutStatus {
  PENDING
  PROCESSING
  PAID
  FAILED
}

// One row per (partner, settlement cycle) — the amount ABIES owes that
// partner for this cycle, aggregated from its Commission rows.
model Payout {
  id             String       @id @default(cuid())
  settlementId   String
  partnerKind    PartnerKind
  partnerId      String
  totalAmount    Int
  status         PayoutStatus @default(PENDING)
  paidAt         DateTime?
  gatewayPayoutRef String?
  failureReason  String?
  createdAt      DateTime     @default(now())
  updatedAt      DateTime     @updatedAt

  settlement     Settlement   @relation(fields: [settlementId], references: [id], onDelete: Cascade)
  commissions    Commission[]

  @@index([settlementId])
  @@index([partnerKind, partnerId])
}

enum SettlementStatus {
  OPEN          // cycle in progress, commissions still accruing
  LOCKED        // cycle closed, payouts generated, awaiting processing
  COMPLETED     // every payout in this cycle is PAID or FAILED
}

// The payout run for one cycle (e.g. weekly) across every partner.
model Settlement {
  id          String           @id @default(cuid())
  cycleStart  DateTime
  cycleEnd    DateTime
  status      SettlementStatus @default(OPEN)
  lockedAt    DateTime?
  completedAt DateTime?
  createdAt   DateTime         @default(now())

  payouts     Payout[]

  @@index([status, cycleStart])
}

// Matches a Payout to the actual bank/gateway settlement report — closes
// the loop between "we say we paid" and "the money actually moved."
model Reconciliation {
  id                String   @id @default(cuid())
  payoutId          String   @unique
  externalReference String   // bank statement line / gateway settlement id
  matchedAmount     Int
  matched           Boolean  @default(false)
  reconciledByUserId String?
  reconciledAt      DateTime?
  notes             String?
  createdAt         DateTime @default(now())

  payout            Payout   @relation(fields: [payoutId], references: [id], onDelete: Cascade)
}
```

**Why this shape**: `Commission` is the immutable ledger entry (never
edited once created, only reversed via a new row — same append-only
discipline as `StockMovement`). `Payout` is the aggregation a partner
actually gets paid against. `Settlement` is the cycle umbrella an admin
opens/locks/completes. `Reconciliation` is the external-truth check.
Every `Int` is rupees, matching `Payment.amount`'s existing convention —
no new money representation introduced.

**Open question carried from the gap analysis**: refund/cancellation
treatment for an already-`INCLUDED`-in-a-payout `Commission` (claw back
from the next cycle, or net against a future payout?) is a real
accounting decision, not an engineering one — flagged, not assumed.

## 2. Hospital domain (backs Journey B, §8.5 — explicitly not blueprint-grounded, see gap analysis)

```prisma
model HospitalFacility {
  id           String   @id @default(cuid())
  name         String
  addressLine1 String
  addressLine2 String?
  city         String
  state        String
  postalCode   String
  active       Boolean  @default(true)
  createdAt    DateTime @default(now())

  wards        HospitalWard[]
}

model HospitalWard {
  id           String   @id @default(cuid())
  facilityId   String
  name         String   // "General Ward A", "ICU", "Panchakarma Inpatient"
  wardType     String   // free text now, promotable to an admin-configurable
                         // domain (ENTERPRISE-2's ConfigCategory precedent)
                         // once real ward types stabilize through use
  active       Boolean  @default(true)

  facility     HospitalFacility @relation(fields: [facilityId], references: [id], onDelete: Cascade)
  beds         HospitalBed[]

  @@index([facilityId])
}

enum BedStatus {
  AVAILABLE
  OCCUPIED
  MAINTENANCE
}

model HospitalBed {
  id        String    @id @default(cuid())
  wardId    String
  label     String    // "A-12"
  status    BedStatus @default(AVAILABLE)

  ward      HospitalWard @relation(fields: [wardId], references: [id], onDelete: Cascade)
  admissions HospitalAdmission[]

  @@unique([wardId, label])
}

enum AdmissionStatus {
  ADMITTED
  DISCHARGED
  TRANSFERRED_OUT   // left this facility for another, not a normal discharge
}

model HospitalAdmission {
  id                String          @id @default(cuid())
  patientUserId     String
  admittingDoctorProfileId String
  facilityId        String
  bedId             String
  admittedAt        DateTime        @default(now())
  reason            String
  status            AdmissionStatus @default(ADMITTED)
  dischargedAt      DateTime?

  patientUser       User            @relation(fields: [patientUserId], references: [id], onDelete: Cascade)
  admittingDoctor   DoctorProfile   @relation(fields: [admittingDoctorProfileId], references: [id], onDelete: Restrict)
  facility          HospitalFacility @relation(fields: [facilityId], references: [id], onDelete: Restrict)
  bed               HospitalBed     @relation(fields: [bedId], references: [id], onDelete: Restrict)
  bedTransfers      HospitalBedTransfer[]
  roundNotes        HospitalRoundNote[]
  dischargeSummary  HospitalDischargeSummary?

  @@index([patientUserId])
  @@index([status])
}

model HospitalBedTransfer {
  id           String   @id @default(cuid())
  admissionId  String
  fromBedId    String
  toBedId      String
  reason       String?
  transferredAt DateTime @default(now())

  admission    HospitalAdmission @relation(fields: [admissionId], references: [id], onDelete: Cascade)
}

// Deliberately minimal: attending-doctor rounds documentation, not a full
// nursing/MAR charting system — see gap analysis §"Inpatient clinical
// scope for the MVP".
model HospitalRoundNote {
  id               String   @id @default(cuid())
  admissionId      String
  authorDoctorProfileId String
  note             String
  createdAt        DateTime @default(now())

  admission        HospitalAdmission @relation(fields: [admissionId], references: [id], onDelete: Cascade)
}

model HospitalDischargeSummary {
  id                String   @id @default(cuid())
  admissionId       String   @unique
  summary           String
  followUpInstructions String?
  dischargedByDoctorProfileId String
  createdAt         DateTime @default(now())

  admission         HospitalAdmission @relation(fields: [admissionId], references: [id], onDelete: Cascade)
}
```

Bed-charge billing intentionally is **not** modelled yet — it would
plug into the existing `Payment` polymorphic pattern
(`purpose: 'HOSPITAL_ADMISSION'`, `purposeEntityId: admission.id`) once
a real per-day/per-ward rate structure is defined; inventing one now
would violate the "no financial assumptions as fact" rule.

## 3. FMCG catalogue (backs §1, §8.5 — additive to the existing Medicine model)

```prisma
model Medicine {
  // ...existing fields unchanged (name, genericName, form, strength,
  // manufacturerName, brandName, requiresPrescription, imageUrl, active,
  // category, hsnCode from ENTERPRISE-7)...
  isFmcg Boolean @default(false) // ADDITIVE
}
```

A dedicated boolean, not an overload of the existing free-text
`category` field (which ENTERPRISE-7 already uses for GST
classification — "Ayurvedic OTC" etc. — and shouldn't be asked to also
carry a sales-channel distinction). `PharmacyInventory`, ordering,
delivery, and POS all stay exactly as they are — an FMCG item is stocked,
ordered, and fulfilled exactly like any other OTC medicine. The only new
surface is: an admin catalogue view filtered to `isFmcg: true`, and a
public storefront section that queries the same `searchPublic()` with
that filter — no new backend model.
