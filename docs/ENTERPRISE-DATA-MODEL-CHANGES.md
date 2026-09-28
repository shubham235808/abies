# Enterprise Data Model Changes

ENTERPRISE-0 deliverable (4 of 5). Every schema change implied by
`docs/ENTERPRISE-GAP-ANALYSIS.md`'s **NEW** and **BACKEND_EXT** items,
grouped by module, each tagged with how safe the migration is. Per
`docs/DOMAIN-MODEL.md`'s own conventions (`cuid()` ids, `createdAt`/
`updatedAt`, `onDelete: Cascade` for owned children) and §79's "prefer
extending existing models, never destroy production-compatible data" rule.
Nothing here is applied yet — this is the plan the brief's own §85 asks for
before any migration runs.

**Migration-safety key**: **ADDITIVE** (new nullable field/model, zero risk
to existing rows or queries) / **ENUM-GROW** (new enum value, safe, but
every `switch`/`if` over the old enum needs an audit for an unhandled-case
default) / **DECISION** (a real modelling choice with tradeoffs, not
mechanical).

## 1. Configuration platform (backs §2, §55)

The `AssessmentTemplateField` model is the existing, working precedent
(seeded, admin-editable in principle, no migration needed to add a field) —
every config table below follows its shape: a plain table with a `key`/
`label`/`active`/`sortOrder`, not a fancier abstraction.

```prisma
model ConfigCategory {       // specialties, medicine categories, diagnostic
  id       String  @id @default(cuid())
  domain   String  // "SPECIALTY" | "MEDICINE_CATEGORY" | "DIAGNOSTIC_CATEGORY" | "PANCHAKARMA_CATEGORY" | "SUPPORT_CATEGORY"
  key      String
  label    String
  active   Boolean @default(true)
  sortOrder Int    @default(0)
  @@unique([domain, key])
}

model ServiceLocation {      // replaces free-text city on DoctorClinic/etc. as a *lookup*, not a rename
  id         String  @id @default(cuid())
  city       String
  state      String
  pinCodes   String[] @default([])
  active     Boolean @default(true)
  @@unique([city, state])
}

model DocumentRequirement {  // per partner-type required-document config
  id           String  @id @default(cuid())
  partnerType  String  // "DOCTOR" | "LAB" | "PHARMACY" | "PANCHAKARMA_CENTRE" | "THERAPIST"
  documentType String
  required     Boolean @default(true)
  active       Boolean @default(true)
}

model CourierProvider {      // backs §11's ask; Shipment.carrier stays a string, this just constrains the UI's choices
  id      String  @id @default(cuid())
  code    String  @unique // "INDIA_POST" | "DELHIVERY" | "BLUEDART" | "DTDC" | "MANUAL" | "OTHER"
  label   String
  active  Boolean @default(true)
}

model NotificationTemplate {
  id          String  @id @default(cuid())
  templateKey String  @unique // matches Notification.templateKey today
  channel     NotificationChannel
  subject     String?
  body        String
  active      Boolean @default(true)
}
```

All **ADDITIVE**. None of these touch an existing model's shape — they're
new lookup tables an admin UI reads/writes, with existing `String[]`/plain-
string fields left exactly as they are until each consuming query is
individually switched to validate against the lookup instead of accepting
any string. That switch-over is a service-layer change, not a migration.

## 2. Location & language (backs §3, §4)

```prisma
model PatientProfile {
  // ...existing fields unchanged...
  additionalLanguages String[] @default([])   // ADDITIVE
  latitude            Float?                   // ADDITIVE
  longitude           Float?                   // ADDITIVE
}
```

`DoctorClinic.latitude`/`longitude` already exist (unused today) — no
change needed there, just a consumer. No new "Location" model is strictly
required to ship a first ranking pass: `ServiceLocation` (above) plus
existing `city`/`pin` fields plus a service-layer scoring function is
enough. A dedicated geo-radius query (PostGIS-style) would be a real
**DECISION** to defer explicitly rather than build speculatively, since
nothing in the current stack (plain Postgres, no PostGIS extension
confirmed) supports it today.

## 3. Promotions (backs §5, §54)

```prisma
enum PromotionPlacement {
  PUBLIC_HOME_HERO
  PUBLIC_HOME_SERVICES
  PATIENT_HOME_HERO
  PATIENT_HOME_DOCTORS
  PATIENT_HOME_DIAGNOSTICS
  PATIENT_HOME_MEDICINES
  PATIENT_HOME_PANCHAKARMA
}

enum PromotionEntityType {
  DOCTOR
  PANCHAKARMA_CENTRE
  DIAGNOSTIC_LAB
  DIAGNOSTIC_TEST
  MEDICINE
  CAMPAIGN   // no specific entity — a general wellness/health campaign banner
}

model Promotion {
  id              String              @id @default(cuid())
  title           String
  subtitle        String?
  description     String?
  desktopImageKey String              // src/lib/storage.ts key, not a public path — admin-uploaded, not static
  mobileImageKey  String?
  ctaLabel        String?
  ctaHref         String?
  placement       PromotionPlacement
  entityType      PromotionEntityType?
  entityId        String?             // polymorphic, same convention as Payment.purposeEntityId
  startAt         DateTime
  endAt           DateTime
  priority        Int                 @default(0)
  active          Boolean             @default(true)
  targetLocations String[]            @default([])  // ServiceLocation.city values, empty = all
  targetLanguages String[]            @default([])  // empty = all
  createdByUserId String
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt
  impressions     Int                 @default(0)
  clicks          Int                 @default(0)
}
```

**ADDITIVE**, net-new model, zero interaction with existing tables besides
the polymorphic `entityId` reference (read-only lookups, no FK). Impression/
click counters are plain `Int` incremented server-side on serve/click — real
counts, not fabricated, per §54's own "do not pretend analytics exist"
instruction; ship without them first if the increment call sites add too
much scope, since a promotion without click tracking is still a complete,
honest feature.

## 4. Notifications (backs §58)

```prisma
model NotificationPreference {
  id            String              @id @default(cuid())
  userId        String
  channel       NotificationChannel
  eventCategory String              // e.g. "APPOINTMENT", "MARKETING", "ORDER_UPDATE"
  enabled       Boolean             @default(true)
  user          User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  @@unique([userId, channel, eventCategory])
}
```

**ADDITIVE**. Already named in `docs/DOMAIN-MODEL.md` §13, never built —
this closes that specific gap. `notify()` (existing, `src/modules/
notifications/notifications.service.ts`) gains one extra guard check before
queueing; no change to how it's called from any of the 12 phases already
calling it.

## 5. Pharmacy: inventory ledger, POS, GST, invoicing (backs §26-34)

The largest and most sensitive set of changes.

```prisma
enum StockMovementType {
  PURCHASE
  SALE
  ONLINE_ORDER
  RETURN
  ADJUSTMENT
  DAMAGED
  EXPIRED
  TRANSFER
  MANUAL_CORRECTION
}

model StockMovement {
  id              String             @id @default(cuid())
  pharmacyId      String
  inventoryId     String
  type            StockMovementType
  quantityDelta   Int                // signed: negative for outflow
  reason          String?
  referenceType   String?            // "MedicineOrder" | "PhysicalSale" | "PurchaseOrder" | null
  referenceId     String?
  actorUserId     String
  createdAt       DateTime           @default(now())
  pharmacy        Pharmacy           @relation(fields: [pharmacyId], references: [id], onDelete: Cascade)
  inventory       PharmacyInventory  @relation(fields: [inventoryId], references: [id], onDelete: Cascade)
  @@index([pharmacyId, createdAt])
  @@index([inventoryId])
}
```

**ADDITIVE** as a model, but **DECISION** on rollout: every existing
`quantityAvailable` mutation site (`catalogue.service.ts`'s
`updateInventory`/`addInventory`, `orders.service.ts`'s `restockItems`/
`bookOrder`) needs a matching `StockMovement.create()` added in the same
transaction — a real, if mechanical, service-layer change touching code
that's been stable and tested since Phase 8. Do this as one focused pass
with the existing integration tests as the regression net, not scattered
across unrelated work.

```prisma
model TaxSettings {                 // one row per pharmacy — GST registration profile
  id                String   @id @default(cuid())
  pharmacyId        String   @unique
  legalBusinessName String
  gstin             String
  registeredState   String
  stateCode         String
  invoicePrefix     String
  active            Boolean  @default(true)
  pharmacy          Pharmacy @relation(fields: [pharmacyId], references: [id], onDelete: Cascade)
}

model Medicine {
  // ...existing fields unchanged...
  category String?   // ADDITIVE
  hsnCode  String?   // ADDITIVE
}

enum PaymentMethod {
  CASH
  UPI
  CARD
  RAZORPAY   // existing online flow, given an explicit value instead of being implicit
  OTHER
}

model PhysicalSale {                // the POS counter-sale — deliberately NOT reusing MedicineOrder
  id             String        @id @default(cuid())
  pharmacyId     String
  customerName   String?
  customerPhone  String?
  paymentMethod  PaymentMethod
  upiReference   String?       // UTR/reference only — never a card/UPI credential, per §30
  subtotal       Int
  discountAmount Int           @default(0)
  taxAmount      Int
  totalAmount    Int
  invoiceId      String?       @unique
  soldByUserId   String
  createdAt      DateTime      @default(now())
  pharmacy       Pharmacy      @relation(fields: [pharmacyId], references: [id], onDelete: Cascade)
  items          PhysicalSaleItem[]
}

model PhysicalSaleItem {
  id              String       @id @default(cuid())
  physicalSaleId  String
  medicineId      String
  batchNumber     String
  quantity        Int
  unitPrice       Int
  taxRate         Int          // basis points or percent*100, decided alongside TaxSettings
  physicalSale    PhysicalSale @relation(fields: [physicalSaleId], references: [id], onDelete: Cascade)
  medicine        Medicine     @relation(fields: [medicineId], references: [id], onDelete: Restrict)
}

model Invoice {                     // shared by online orders and physical sales — polymorphic source, same convention as elsewhere
  id              String   @id @default(cuid())
  pharmacyId      String
  invoiceNumber   String   // TaxSettings.invoicePrefix + sequence
  sourceType      String   // "MedicineOrder" | "PhysicalSale"
  sourceId        String
  cgst            Int
  sgst            Int
  igst            Int
  totalTax        Int
  totalAmount     Int
  pdfStorageKey   String?
  createdAt       DateTime @default(now())
  pharmacy        Pharmacy @relation(fields: [pharmacyId], references: [id], onDelete: Cascade)
  @@unique([pharmacyId, invoiceNumber])
}
```

`PhysicalSale`/`PhysicalSaleItem` are a **DECISION**, deliberately modelled
as their own thing rather than shoehorned into `MedicineOrder` — the same
"don't force distinct workflows into one generic table" principle the brief
itself states in §73 and that `docs/DOMAIN-MODEL.md` already applies to
`Appointment`/`DiagnosticOrder`/`MedicineOrder`/`PanchakarmaBooking` staying
separate. A `MedicineOrder` is fundamentally online-order-shaped (has a
`Payment` FK, a delivery address, a patient account) — a counter sale has
none of those and gains a cash-drawer/walk-in-customer shape instead;
merging them would mean nullable-everything on both sides for no real
reuse. `TaxSettings`/`Medicine.hsnCode`/`Invoice` are all **ADDITIVE**.
`PaymentMethod` is a fresh enum, not a change to existing `Payment.gateway`
(a plain string today, left alone).

**This entire section is flagged COMPLIANCE in `docs/ENTERPRISE-GAP-ANALYSIS.md`**
— the schema above is a reasonable structural guess at what a compliant GST
invoice needs (CGST/SGST/IGST split, HSN, invoice sequencing), not a
substitute for real accounting/legal review of the actual tax-rate table and
invoice-format requirements before this ships to real transactions.

## 6. Diagnostics: packages (backs §10, §21)

```prisma
model DiagnosticPackage {
  id      String                @id @default(cuid())
  labId   String
  name    String
  price   Int
  active  Boolean               @default(true)
  lab     DiagnosticLab         @relation(fields: [labId], references: [id], onDelete: Cascade)
  tests   DiagnosticPackageTest[]
}

model DiagnosticPackageTest {   // explicit join table, not a testIds: String[] — needed if per-test price override inside a package ever matters
  packageId String
  testId    String
  package   DiagnosticPackage @relation(fields: [packageId], references: [id], onDelete: Cascade)
  test      DiagnosticTest    @relation(fields: [testId], references: [id], onDelete: Cascade)
  @@id([packageId, testId])
}
```

`DiagnosticRecommendation.packageId` and `DiagnosticOrderItem.packageId`
need adding (both **ADDITIVE**, nullable — `docs/DOMAIN-MODEL.md`'s original
design already anticipated exactly this, per the Phase 7 comment
"testId/packageId were already both nullable... specifically so this can
land without a schema change later").

## 7. Panchakarma: therapy images, therapist documents (backs §36-38)

```prisma
model Therapy {
  // ...existing fields unchanged...
  images String[] @default([])   // ADDITIVE
}

enum TherapistDocumentStatus {   // mirrors DoctorDocumentStatus
  PENDING
  VERIFIED
  REJECTED
}

model TherapistDocument {        // structurally identical to DoctorDocument — direct pattern reuse
  id          String                   @id @default(cuid())
  therapistId String
  type        String                   // e.g. "ID_PROOF" | "QUALIFICATION_CERTIFICATE" | "PROFILE_PHOTO"
  status      TherapistDocumentStatus  @default(PENDING)
  originalName String
  storedName   String
  mimeType     String
  sizeBytes    Int
  storagePath  String
  reviewNote   String?
  verifiedAt   DateTime?
  createdAt    DateTime                @default(now())
  therapist    Therapist                @relation(fields: [therapistId], references: [id], onDelete: Cascade)
}

model Therapist {
  // ...existing fields unchanged...
  languages          String[]                @default([])  // ADDITIVE
  verificationStatus TherapistDocumentStatus? @default(PENDING)  // ADDITIVE — nullable so existing rows don't need a backfill decision
  documents          TherapistDocument[]
}
```

All **ADDITIVE**. This is explicitly "build `DoctorDocument`'s already-
proven shape a second time for `Therapist`" — no new design risk.

## 8. Support: Technical Support incident fields (backs §44-45)

**DECISION**, not resolved here (see `docs/PORTAL-UX-SPEC.md`'s Technical
Support addendum) — two real options:

```prisma
// Option A: extend SupportTicket directly (nullable, only populated when department=TECH_SUPPORT)
model SupportTicket {
  // ...existing fields unchanged...
  technicalModule      String?   // ADDITIVE
  correlationRequestId String?   // ADDITIVE — can be populated from src/proxy.ts's existing x-request-id
  browserContext       String?   // ADDITIVE — plain string, never a full user-agent dump with fingerprinting risk
  errorClassification  String?   // ADDITIVE
}
```

```prisma
// Option B: a 1:1 side table, cleaner separation, no nullable-field sprawl on the shared ticket model
model TechnicalIncidentDetail {
  id                    String        @id @default(cuid())
  ticketId              String        @unique
  technicalModule       String?
  correlationRequestId  String?
  browserContext        String?
  errorClassification   String?
  ticket                SupportTicket @relation(fields: [ticketId], references: [id], onDelete: Cascade)
}
```

Recommendation, not a decision made unilaterally: Option B, since it keeps
`SupportTicket` — already shared by four departments — from accumulating
fields only one department ever populates, matching the existing "don't add
a column three of four consumers will always leave null" instinct this
schema already follows elsewhere (e.g. why `Payment` and `SupportTicket`
both use polymorphic string references instead of a dozen nullable FKs).
Either option is a small, safe migration; the real work is deciding what
"browser context" and "error classification" concretely mean before writing
the column, per §45's own explicit ban on exposing passwords/OTPs/tokens/
payment credentials in this data.

## 9. Permissions (backs §56)

**BACKEND_EXT**, no schema change required for a first pass — a permission
string list can live as a plain TypeScript const map
(`src/server/permissions.ts`, e.g. `ROLE_PERMISSIONS: Record<UserRole,
string[]>`) checked by a new `requirePermission(ctx, 'pharmacy.product.create')`
helper alongside the existing `requireRole`/`requireAdminMfa` in
`src/server/rbac.ts` — additive to that file, not a rewrite. A DB-backed,
admin-editable permission set (matching §2's configuration principle) is a
later refinement once the string vocabulary itself has stabilized through
real use; hard-coding it first, then making it data-driven once the shape
is proven, avoids over-engineering a permissions UI before anyone has used
the permissions themselves.

## Summary — migration risk profile

Everything in sections 1-4, 6, 7, and most of 5 (`TaxSettings`, `Medicine`
additions, `Invoice`) is **ADDITIVE**: new nullable fields or wholly new
tables, safe to migrate against the live database with zero risk to
existing rows, exactly matching §79's "prefer extending existing models...
never destroy production-compatible data" instruction. The two genuine
**DECISION** points that need a real answer before writing migrations are:
(a) `PhysicalSale` as its own model vs. forcing it into `MedicineOrder`
(recommend: its own model, reasoning above), and (b) Technical Support's
incident fields as a `SupportTicket` extension vs. a side table (recommend:
side table, reasoning above). Section 5's `StockMovement` rollout is
additive as a model but needs a real, careful service-layer pass through
every existing inventory-mutation call site — the one item here that
touches already-shipped, already-tested code rather than only adding to it.
