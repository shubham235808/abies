# Domain Model

Source: Enhanced Blueprint §11, §12, §19 (screen inventory, Care Plan Engine,
core data model), Sprint 3 `prisma/schema.prisma` (validated baseline, D3),
and the full entity/enum lists in the build brief. This is the reference for
`prisma/schema.prisma` — not yet the schema file itself. Entities marked
**[baseline]** are carried over field-for-field from the validated Sprint 3
schema; everything else is net-new, designed from the blueprint since no
implementation exists to validate it against (see Current State).

Conventions used throughout: `cuid()` ids, `createdAt`/`updatedAt` timestamps,
soft-deletion only where a record has downstream financial/clinical
references (orders, prescriptions, consultations — never hard-deleted),
foreign keys `onDelete: Cascade` for owned child records, `Restrict` where
deletion would orphan a financial/audit trail.

## 1. Identity & Access

**User** [baseline] — `id, mobile (unique), email (unique, optional), role,
status, mfaEnabled, createdAt, updatedAt`. `role`: `PATIENT | DOCTOR | ADMIN |
LAB | PHARMACY | PANCHAKARMA_CENTRE | CUSTOMER_SUPPORT | TECH_SUPPORT | SALES
| CARE_COORDINATOR` (extends Sprint 3's 5-role enum with the 5 additional
portal roles required by this build). `status`: `ACTIVE | PENDING | SUSPENDED
| DISABLED`.

**Session** [baseline] — `id, userId, refreshTokenHash (unique, SHA-256),
mfaVerified, expiresAt, revokedAt, ip, userAgent, createdAt, updatedAt`.

**OtpChallenge** [baseline] — `id, mobile, role, codeHash (HMAC), attempts,
maxAttempts, expiresAt, consumedAt, createdAt`.

**ConsentArtifact** [baseline] — `id, key, version, title, bodyUrl, required,
active, createdAt`, unique on `(key, version)`. Keys: `terms`, `privacy`,
`health-data-processing`, `teleconsultation`, `record-sharing`, `marketing`.

**ConsentRecord** [baseline] — `id, userId, artifactId, acceptedAt,
withdrawnAt, ip, userAgent`, unique on `(userId, artifactId)`.

**AuditEvent** [baseline] — `id, userId, sessionId, eventType, resourceType,
resourceId, action, method, path, statusCode, ip, userAgent, metadata (json),
createdAt`. No PHI in `metadata`.

**StaffProfile** *(new)* — links a non-patient/non-doctor `User` (LAB,
PHARMACY, PANCHAKARMA_CENTRE, CUSTOMER_SUPPORT, TECH_SUPPORT, SALES,
CARE_COORDINATOR) to the partner org or department they act for:
`id, userId (unique), department (enum, nullable — for internal roles),
organizationId (nullable FK — for partner roles), title, active`.

## 2. Patients

**PatientProfile** [baseline, extended] — `id, userId (unique), firstName,
lastName, dateOfBirth, gender, city, preferredLanguage (default English),
emergencyContact`, **plus new fields required by the brief**: `phone`
(distinct from login mobile where relevant), `address, state, pin,
allergies (string[]), medicalHistory (text), consentPreferences (json)`.

**FamilyMember** [baseline, extended] — `id, patientProfileId, name,
relation, dateOfBirth, gender, mobile`, **plus** `relationType` constrained
to `PARENT | SPOUSE | CHILD | DEPENDENT | OTHER` so downstream bookings can
identify the actual care recipient distinctly from the account holder.
Every `Appointment`, `MedicineOrder`, `DiagnosticOrder`, `PanchakarmaBooking`,
and `CarePlan` carries an optional `careRecipientFamilyMemberId` — null means
the patient themself.

## 3. Doctor / Provider Network

**DoctorProfile** [baseline] — `id, userId (unique), slug (unique), title
(default "Dr."), firstName, lastName, gender, bio, registrationCouncil,
registrationNumber, registrationYear, primaryQualification,
highestQualification, graduationInstitution, graduationYear,
yearsExperience, specialties (string[]), languages (string[]),
consultationModes (ConsultationMode[]), videoFee, clinicFee, rating,
reviewCount, isAcceptingNewPatients, verificationStatus, isDiscoverable,
submittedAt, reviewedAt, reviewedByUserId, rejectionReason`. Unique on
`(registrationCouncil, registrationNumber)`. `graduationInstitution` /
`graduationYear` are additive to the Sprint 3 baseline (named explicitly in
the brief's onboarding field list; Sprint 3 didn't separately track them from
`primaryQualification`).

`ConsultationMode`: `VIDEO | CLINIC` [baseline].
`DoctorVerificationStatus`: `DRAFT | SUBMITTED | UNDER_REVIEW | APPROVED |
REJECTED | SUSPENDED` [baseline] — see State Machines below for the
transition rules ported from D3.

**DoctorDocument** [baseline] — `id, doctorProfileId, type, status,
originalName, storedName, mimeType, sizeBytes, storagePath, reviewNote,
verifiedAt`. `type`: `REGISTRATION_CERTIFICATE | DEGREE_CERTIFICATE |
ID_PROOF | PROFILE_PHOTO | OTHER` [baseline]. `status`: `PENDING | VERIFIED |
REJECTED` — note the brief's spec text says `UPLOADED/UNDER_REVIEW/VERIFIED/
REJECTED`; the validated Sprint 3 implementation uses a simpler `PENDING`
initial state. Kept as `PENDING` (D3 precedence) with `UNDER_REVIEW`
representable via the doctor's own `verificationStatus` context rather than a
redundant per-document state.

**DoctorClinic** [baseline] — `id, doctorProfileId, name, addressLine1,
addressLine2, city, state, postalCode, phone, latitude, longitude, active`.

**DoctorAvailability** [baseline] — `id, doctorProfileId, dayOfWeek (0–6),
startTime, endTime, slotMinutes (default 30), mode, active`. `mode` must be
one already enabled in the profile's `consultationModes` — enforced in the
service layer per D3, not just a DB constraint, so the UI can show the
"enable this mode on your profile first" message from Sprint 3.

**DoctorVerificationAction** [baseline] — `id, doctorProfileId, adminUserId,
fromStatus, toStatus, notes, createdAt`. Written on every transition.

## 4. Appointments

**AppointmentSlot** *(new)* — a temporary hold representing one bookable
unit: `id, doctorProfileId, clinicId (nullable, required if mode=CLINIC),
mode, startsAt, endsAt, status (OPEN|HELD|BOOKED), heldByUserId, heldUntil`.
Generated from `DoctorAvailability` on demand (not pre-materialized forever)
and locked transactionally when a patient begins checkout, to prevent double
booking — a unique constraint on `(doctorProfileId, startsAt, mode)` plus a
`SELECT ... FOR UPDATE`/serializable transaction on hold-creation.

**Appointment** *(new)* — `id, patientUserId, careRecipientFamilyMemberId
(nullable), doctorProfileId, slotId, mode, clinicId (nullable), scheduledAt,
durationMinutes, status, reasonForVisit, paymentId (nullable until paid),
cancelledAt, cancelledBy, cancellationReason, rescheduledFromId (nullable,
self-referential), createdAt, updatedAt`.
`status`: `PENDING_PAYMENT | CONFIRMED | CANCELLED | RESCHEDULED | COMPLETED
| NO_SHOW` (brief's exact list). See State Machines.

## 5. Consultations & Clinical Record

**Consultation** *(new)* — `id, appointmentId (unique), doctorProfileId,
patientUserId, startedAt, endedAt, videoSessionId (nullable FK to
VideoSession), chiefComplaint, historyOfPresentIllness, notes, status
(SCHEDULED|IN_PROGRESS|COMPLETED|CANCELLED)`.

**ClinicalNote** *(new)* — `id, consultationId, ayurvedaAssessment (json —
see below), diagnosis, treatmentPlan, recommendations, followUpDate,
finalizedAt (null until doctor signs off), createdAt, updatedAt`.
`ayurvedaAssessment` json shape is driven by a configurable
**AssessmentTemplateField** table (`key, label, fieldType, options[],
active`) seeded with `Prakriti, Vikriti, Agni, Koshta` but not hard-coded
into the schema, per the brief's "should be configurable rather than rigidly
hard-coded" instruction.

**VideoSession** *(new)* — provider-agnostic: `id, consultationId (unique),
provider (enum, adapter-selected), providerSessionRef, joinWindowStart,
joinWindowEnd, patientJoinedAt, doctorJoinedAt, endedAt, failureReason`. No
provider credentials stored on the patient/doctor-visible record — the
adapter resolves join tokens server-side, per-request.

**Prescription** *(new)* — `id, consultationId, doctorProfileId,
patientUserId, status (DRAFT|FINALIZED|SUPERSEDED), finalizedAt,
supersedesId (nullable, self-referential — corrections create a new
version, never mutate a finalized prescription), doctorNotes`. Immutability
rule: once `status=FINALIZED`, the row and its `PrescriptionItem`s become
read-only at the service layer; a "correction" always creates a new
`Prescription` with `supersedesId` set.

**PrescriptionItem** *(new)* — `id, prescriptionId, medicineId (nullable FK
— may reference an unlisted/compounded product by free-text name), productName,
dosage, frequency, durationDays, route, instructions, startDate, endDate`.

## 6. Care Plan Engine (central orchestration layer)

**CarePlan** *(new)* — `id, patientUserId, careRecipientFamilyMemberId
(nullable), doctorProfileId (clinical owner), consultationId (nullable —
plan may originate outside a single consultation), startDate, targetDate,
status, summary, goals (text[])`.
`status`: `DRAFT | ACTIVE | PAUSED | COMPLETED | CANCELLED | SUPERSEDED`
(blueprint §12 list, union'd with the brief's `PLANNED/ACTIVE/COMPLETED/
MISSED/CANCELLED` which the blueprint clarifies are actually per-*item*
states, not per-*plan* — see `CarePlanItem` below).

**CarePlanItem** *(new)* — `id, carePlanId, type (enum), title, description,
status, startDate, dueDate, completedDate, relatedEntityType (enum:
CONSULTATION|DIAGNOSTIC_ORDER|MEDICINE_ORDER|PANCHAKARMA_BOOKING|TASK),
relatedEntityId (nullable), ownerUserId (nullable — who's accountable: patient
for a task, doctor for a review milestone), notes`.
`type`: `CONSULTATION | DIAGNOSTIC | MEDICINE | PANCHAKARMA | LIFESTYLE |
DIET | FOLLOW_UP | TASK | MILESTONE`.
`status`: `PLANNED | ACTIVE | COMPLETED | MISSED | CANCELLED` (brief's exact
list, applied at item granularity).

**Critical product rule carried into permissions** (blueprint §12): only an
authorized clinician (the plan's `doctorProfileId`, or another doctor with an
explicit hand-off) may create a `CarePlan` or change a `CarePlanItem`'s
clinical content (title/description/type/relatedEntity). Patients and
partners may only update *fulfilment* status fields (e.g., marking a task
"I completed this" is a patient-visible acknowledgement flag, separate from
the clinician-owned `status`, so commercial/patient actions never silently
alter clinical instructions.

## 7. Diagnostics (deliberately separate from Reports — blueprint explicit rule)

**DiagnosticLab** *(new)* — partner org: `id, name, licenseNumbers (json),
serviceCities (string[]), homeCollectionSupported, active, verificationStatus`
(mirrors doctor verification shape for consistency).

**DiagnosticTest** *(new)* — catalogue item: `id, labId (nullable — null =
platform-wide catalogue test, mappable to any lab that supports it), code,
name, description, sampleType, preparationInstructions, price,
turnaroundHours, active`.

**DiagnosticPackage** *(new)* — `id, labId, name, testIds (string[]), price,
active`.

**DiagnosticRecommendation** *(new)* — the clinician's order intent, distinct
from the patient's booking: `id, carePlanItemId (nullable), consultationId,
doctorProfileId, patientUserId, testId (nullable), packageId (nullable),
clinicalReason, targetCompletionDate, status
(RECOMMENDED|BOOKED|FULFILLED|CANCELLED)`.

**DiagnosticOrder** *(new)* — the patient's actual booking against a chosen
lab: `id, recommendationId (nullable — patient-initiated tests without a
doctor order are allowed per blueprint but flagged), patientUserId, labId,
collectionMode (HOME|LAB_VISIT), scheduledAt, address (nullable, required if
HOME), paymentId, status`.
`status`: `RECOMMENDED | BOOKED | SCHEDULED | SAMPLE_COLLECTED | PROCESSING |
COMPLETED | CANCELLED` (brief's exact list).

**DiagnosticOrderItem** *(new)* — `id, diagnosticOrderId, testId (nullable),
packageId (nullable), price`.

**SampleCollection** *(new)* — `id, diagnosticOrderId, collectorName,
collectedAt, sampleBarcode, qualityException (nullable text)`.

**DiagnosticReport** *(new)* — `id, diagnosticOrderId, structuredResults
(json, nullable), documentStorageKey, releasedToPatientAt, notifiedDoctorAt,
criticalFlag, doctorAcknowledgedAt`.

## 8. Reports (patient document library — separate concept from diagnostic booking)

**Report** *(new)* — a generic clinical-document envelope so patients have
one place for everything: `id, patientUserId, kind
(DIAGNOSTIC_REPORT|UPLOADED_HISTORICAL|PRESCRIPTION|CLINICAL_DOCUMENT|
DISCHARGE_SUMMARY), sourceEntityType, sourceEntityId (nullable — null for
patient-uploaded historical documents), storageKey, uploadedByUserId,
sharedWithConsent (json — which parties/consultations this has been
attached to), attachedToConsultationId (nullable), attachedToCarePlanId
(nullable)`.

## 9. Medicines & Pharmacy

**Medicine** *(new)* — `id, brandId, name, genericName, form, strength,
manufacturerId, requiresPrescription, active`.
**Brand** / **Manufacturer** *(new)* — simple reference tables:
`id, name`.
**Pharmacy** *(new)* — partner org, same verification shape as
`DiagnosticLab`: `id, name, licenseNumbers (json), serviceAreas (json),
active, verificationStatus`.
**PharmacyInventory** *(new)* — `id, pharmacyId, medicineId, batchNumber,
expiryDate, quantityAvailable, price`.
**MedicineOrder** *(new)* — `id, prescriptionId (nullable — OTC items
allowed but flagged), patientUserId, careRecipientFamilyMemberId (nullable),
pharmacyId, paymentId, status, deliveryAddress`.
`status`: `PENDING | ACCEPTED | PACKING | DISPATCHED | DELIVERED |
CANCELLED` (brief's exact list).
**MedicineOrderItem** *(new)* — `id, medicineOrderId, prescriptionItemId
(nullable), medicineId, batchNumber, quantity, unitPrice`. No silent
substitution: a substitution requires an explicit
`MedicineOrderItemSubstitution` audit row with pharmacist + patient/
practitioner approval reference before `medicineId` may differ from the
prescribed item.
**Shipment** *(new)* — `id, medicineOrderId, carrier, trackingRef,
dispatchedAt, deliveredAt, proofOfDeliveryStorageKey`.

## 10. Panchakarma

**PanchakarmaCentre** *(new)* — same verification shape as other partners:
`id, name, addressLine1, city, state, postalCode, supervisingPractitioner,
licenseNumbers (json), active, verificationStatus`.
**Therapy** *(new)* — `id, centreId, name, description, durationMinutes,
prerequisites, contraindications, price, requiredSupervision`.
**TherapyPackage** *(new)* — `id, centreId, name, therapyIds (string[]),
sessionCount, price`.
**Therapist** *(new)* — `id, centreId, name, qualifications, active`.
**PanchakarmaRecommendation** *(new)* — clinician intent, mirrors
`DiagnosticRecommendation`: `id, carePlanItemId (nullable), consultationId,
doctorProfileId, patientUserId, therapyId or packageId, clinicalReason,
sessionCountRecommended, status`.
**PanchakarmaBooking** *(new)* — `id, recommendationId (nullable), centreId,
patientUserId, therapyId or packageId, paymentId, status`.
`status`: `RECOMMENDED | BOOKED | SCHEDULED | IN_PROGRESS | COMPLETED |
CANCELLED` (brief's exact list).
**PanchakarmaSession** *(new)* — `id, bookingId, sessionNumber, therapistId,
scheduledAt, attendedAt, notes, exceptionFlag (nullable text)`.

## 11. Payments

**Payment** *(new)* — `id, payerUserId, purpose (enum:
CONSULTATION|DIAGNOSTIC_ORDER|MEDICINE_ORDER|PANCHAKARMA_BOOKING|PACKAGE),
purposeEntityId, amount, currency (default INR), status, gateway (default
razorpay), gatewayOrderId, gatewayPaymentId, gatewaySignature, verifiedAt`.
`status`: `CREATED | PENDING | SUCCESS | FAILED | REFUNDED |
PARTIALLY_REFUNDED` (brief's exact list). `verifiedAt` is only ever set by
the server-side Razorpay webhook/signature-verification path — never by a
client callback alone (blueprint + brief both explicitly require this).

**Refund** *(new)* — `id, paymentId, amount, reason, status
(REQUESTED|APPROVED|PROCESSING|COMPLETED|REJECTED), approvedByUserId
(nullable, MFA-gated admin action), gatewayRefundRef`.

## 12. Support / Sales / Care Coordination CRM

**SupportTicket** *(new)* — `id, requesterUserId, category, department
(CUSTOMER_SUPPORT|TECHNICAL_SUPPORT|SALES|CARE_COORDINATION), priority
(P1|P2|P3|P4), channel (IN_APP|WHATSAPP|PHONE|EMAIL|WEB_FORM|PARTNER),
assignedAgentUserId, status, sla (json — response/resolution deadlines per
blueprint §27 SLA table), subject, description, linkedPatientUserId,
linkedAppointmentId, linkedMedicineOrderId, linkedDiagnosticOrderId,
linkedPanchakarmaBookingId, createdAt, lastResponseAt, resolvedAt`.
`status`: `OPEN | IN_PROGRESS | WAITING_CUSTOMER | WAITING_PARTNER |
RESOLVED | CLOSED` (brief's exact list).
**SupportMessage** *(new)* — `id, ticketId, authorUserId (nullable for
system messages), body, createdAt`.
**SupportAttachment** *(new)* — `id, ticketId, messageId (nullable),
storageKey, uploadedByUserId`.

**PartnerLead** *(new)* — `id, kind (DOCTOR|CLINIC|LAB|PHARMACY|
PANCHAKARMA_CENTRE|CORPORATE), source, contactName, contactPhone,
contactEmail, city, ownerUserId (sales rep), stage
(LEAD|QUALIFIED|VERIFICATION|COMMERCIAL|ENABLEMENT|ACTIVATED|REJECTED),
nextFollowUpAt, notes (text), documentKeys (string[])`.

## 13. Notifications

**Notification** *(new)* — `id, userId, channel (SMS|EMAIL|WHATSAPP|IN_APP|
PUSH), templateKey, payload (json), status (QUEUED|SENT|FAILED|READ),
sentAt, readAt`.
**NotificationPreference** *(new)* — `id, userId, channel, eventCategory,
enabled` — lets patients opt out of non-critical channels while critical
events (OTP, payment, safety) remain non-optional.

## 14. Storage

Object storage is not a Prisma model but a `lib/storage` adapter
(`putObject`, `getSignedDownloadUrl`, `deleteObject`) backing every
`storageKey`/`storagePath` field above. MIME/extension/size validated at the
module boundary before a key is ever written to the DB (pattern ported from
Sprint 3's doctor-document upload, generalized).

---

## State machines

### DoctorVerificationStatus [baseline, D3]
```
DRAFT --submit(checklist passes)--> SUBMITTED
SUBMITTED --startReview--> UNDER_REVIEW
SUBMITTED | UNDER_REVIEW --approve(both mandatory docs VERIFIED)--> APPROVED
SUBMITTED | UNDER_REVIEW --reject(reason)--> REJECTED
APPROVED --suspend(reason)--> SUSPENDED
REJECTED --edit profile--> DRAFT (auto-reset, rejectionReason cleared)
```
Only `DRAFT`/`REJECTED` are editable. `isDiscoverable` is true only in
`APPROVED`.

### AppointmentStatus (new, blueprint-consistent)
```
PENDING_PAYMENT --payment success--> CONFIRMED
PENDING_PAYMENT --slot hold expires / payment fails--> CANCELLED
CONFIRMED --reschedule--> RESCHEDULED (new Appointment row created, this one closes)
CONFIRMED --cancel--> CANCELLED
CONFIRMED --consultation completes--> COMPLETED
CONFIRMED --window passes, no join--> NO_SHOW
```

### DiagnosticOrder / PanchakarmaBooking status
Both follow the same shape: `RECOMMENDED → BOOKED → SCHEDULED →
{SAMPLE_COLLECTED→PROCESSING (diagnostics) | IN_PROGRESS (panchakarma)} →
COMPLETED`, with `CANCELLED` reachable from any pre-`COMPLETED` state.

### MedicineOrder status
`PENDING → ACCEPTED → PACKING → DISPATCHED → DELIVERED`, `CANCELLED`
reachable before `DISPATCHED`.

### Payment status
`CREATED → PENDING → SUCCESS`, or `→ FAILED`. `SUCCESS → REFUNDED |
PARTIALLY_REFUNDED` only via an approved `Refund`.

### SupportTicket status
`OPEN → IN_PROGRESS → {WAITING_CUSTOMER | WAITING_PARTNER} → IN_PROGRESS →
RESOLVED → CLOSED`, any state may re-open to `IN_PROGRESS`.

---

## Deferred/explicitly out of MVP schema

ABDM/ABHA/HPR/HFR identifiers are **not** modeled as required fields yet —
the blueprint explicitly stages this ("Foundation → Registry alignment →
ABHA → Health records → Consent"). Where useful, entities that will
eventually carry an ABDM identifier (`User`, `DoctorProfile`,
`DiagnosticLab`, `Pharmacy`, `PanchakarmaCentre`) get a nullable
`abdmIdentifier` placeholder column now so the migration path doesn't
require a later structural change, but no ABDM integration logic ships in
Phase 0–11.
