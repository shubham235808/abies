import { prisma } from '@/lib/db';
import { BadRequestError, ConflictError, NotFoundError } from '@/lib/errors';
import { normalizeMobile } from '@/modules/auth/auth.service';
import { notify } from '@/modules/notifications/notifications.service';
import { recordAuditEvent } from '@/server/audit';
import type { AuditContext } from '@/server/audit';
import type { addRoundNoteSchema, admitPatientSchema, composeDischargeSummarySchema, transferBedSchema } from './hospital.schemas';
import type { z } from 'zod';

function admissionDetailInclude() {
  return {
    patientUser: { select: { id: true, mobile: true, patientProfile: { select: { firstName: true, lastName: true } } } },
    admittingDoctor: { select: { id: true, userId: true, firstName: true, lastName: true } },
    facility: { select: { id: true, name: true } },
    bed: { select: { id: true, label: true, ward: { select: { id: true, name: true } } } },
    bedTransfers: { orderBy: { transferredAt: 'desc' as const } },
    roundNotes: { orderBy: { createdAt: 'desc' as const } },
    dischargeSummary: true,
  };
}

export async function getAdmission(admissionId: string) {
  const admission = await prisma.hospitalAdmission.findUnique({ where: { id: admissionId }, include: admissionDetailInclude() });
  if (!admission) throw new NotFoundError('Admission not found');
  return admission;
}

// Admin ops — admits an existing, registered patient (looked up by mobile,
// same exact-match convention as modules/support/tickets.service.ts's
// linkedPatientMobile; there's no patient search/autocomplete anywhere in
// this app, so this doesn't invent one).
export async function admitPatient(dto: z.infer<typeof admitPatientSchema>, auditCtx: AuditContext) {
  // The admin types a bare 10-digit number; every number in this schema is
  // stored +91-prefixed (modules/auth/auth.service.ts's normalizeMobile,
  // the same normalization the OTP login flow applies before ever touching
  // the DB) — without it, a correctly-typed mobile would never match.
  const patient = await prisma.user.findUnique({ where: { mobile: normalizeMobile(dto.patientMobile) } });
  if (!patient || patient.role !== 'PATIENT') throw new NotFoundError('No patient found with that mobile number');

  const doctor = await prisma.doctorProfile.findUnique({ where: { id: dto.admittingDoctorProfileId } });
  if (!doctor || doctor.verificationStatus !== 'APPROVED') throw new BadRequestError('Admitting doctor must be an approved doctor');

  const bed = await prisma.hospitalBed.findUnique({ where: { id: dto.bedId }, include: { ward: true } });
  if (!bed) throw new NotFoundError('Bed not found');
  if (bed.status !== 'AVAILABLE') throw new ConflictError('This bed is not available');

  const admission = await prisma.$transaction(async (tx) => {
    const created = await tx.hospitalAdmission.create({
      data: {
        patientUserId: patient.id,
        admittingDoctorProfileId: doctor.id,
        facilityId: bed.ward.facilityId,
        bedId: bed.id,
        reason: dto.reason,
      },
      include: admissionDetailInclude(),
    });
    await tx.hospitalBed.update({ where: { id: bed.id }, data: { status: 'OCCUPIED' } });
    return created;
  });

  await notify(patient.id, 'IN_APP', 'hospital.admitted', { admissionId: admission.id });
  await recordAuditEvent(auditCtx, { eventType: 'HOSPITAL', action: 'ADMITTED', resourceType: 'HospitalAdmission', resourceId: admission.id, metadata: { bedId: bed.id } });
  return admission;
}

export async function transferBed(admissionId: string, dto: z.infer<typeof transferBedSchema>, auditCtx: AuditContext) {
  const admission = await prisma.hospitalAdmission.findUnique({ where: { id: admissionId } });
  if (!admission) throw new NotFoundError('Admission not found');
  if (admission.status !== 'ADMITTED') throw new ConflictError('Only an active admission can be transferred');
  if (dto.toBedId === admission.bedId) throw new BadRequestError('Already in this bed');

  const toBed = await prisma.hospitalBed.findUnique({ where: { id: dto.toBedId }, include: { ward: true } });
  if (!toBed) throw new NotFoundError('Destination bed not found');
  if (toBed.status !== 'AVAILABLE') throw new ConflictError('Destination bed is not available');

  const fromBedId = admission.bedId;
  const updated = await prisma.$transaction(async (tx) => {
    await tx.hospitalBedTransfer.create({ data: { admissionId, fromBedId, toBedId: toBed.id, reason: dto.reason } });
    const result = await tx.hospitalAdmission.update({
      where: { id: admissionId },
      data: { bedId: toBed.id, facilityId: toBed.ward.facilityId },
      include: admissionDetailInclude(),
    });
    await tx.hospitalBed.update({ where: { id: fromBedId }, data: { status: 'AVAILABLE' } });
    await tx.hospitalBed.update({ where: { id: toBed.id }, data: { status: 'OCCUPIED' } });
    return result;
  });

  await notify(admission.patientUserId, 'IN_APP', 'hospital.transferred', { admissionId });
  await recordAuditEvent(auditCtx, { eventType: 'HOSPITAL', action: 'TRANSFERRED', resourceType: 'HospitalAdmission', resourceId: admissionId, metadata: { fromBedId, toBedId: toBed.id } });
  return updated;
}

// Admin ops-only discharge — frees the bed immediately. Independent of
// composeDischargeSummary below: either can happen first (a doctor's
// clinical sign-off, or the front desk processing a bed that's already
// been vacated), and the other becomes a no-op/safe addition rather than
// a hard dependency on ordering.
export async function dischargeAdmission(admissionId: string, auditCtx: AuditContext) {
  const admission = await prisma.hospitalAdmission.findUnique({ where: { id: admissionId } });
  if (!admission) throw new NotFoundError('Admission not found');
  if (admission.status !== 'ADMITTED') throw new ConflictError('This admission is not active');

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.hospitalAdmission.update({
      where: { id: admissionId },
      data: { status: 'DISCHARGED', dischargedAt: new Date() },
      include: admissionDetailInclude(),
    });
    await tx.hospitalBed.update({ where: { id: admission.bedId }, data: { status: 'AVAILABLE' } });
    return result;
  });

  await notify(admission.patientUserId, 'IN_APP', 'hospital.discharged', { admissionId });
  await recordAuditEvent(auditCtx, { eventType: 'HOSPITAL', action: 'DISCHARGED', resourceType: 'HospitalAdmission', resourceId: admissionId });
  return updated;
}

async function ownedByAdmittingDoctor(doctorUserId: string, admissionId: string) {
  const admission = await prisma.hospitalAdmission.findUnique({ where: { id: admissionId }, include: { admittingDoctor: true } });
  if (!admission || admission.admittingDoctor.userId !== doctorUserId) throw new NotFoundError('Admission not found');
  return admission;
}

// Doctor portal — the attending physician's own admitted-patients list.
export async function listMineAsDoctor(doctorUserId: string) {
  const doctor = await prisma.doctorProfile.findUnique({ where: { userId: doctorUserId } });
  if (!doctor) throw new NotFoundError('Doctor profile not found');
  return prisma.hospitalAdmission.findMany({
    where: { admittingDoctorProfileId: doctor.id },
    include: admissionDetailInclude(),
    orderBy: { admittedAt: 'desc' },
  });
}

export async function getAdmissionForDoctor(doctorUserId: string, admissionId: string) {
  await ownedByAdmittingDoctor(doctorUserId, admissionId);
  return getAdmission(admissionId);
}

export async function addRoundNote(doctorUserId: string, admissionId: string, dto: z.infer<typeof addRoundNoteSchema>) {
  const admission = await ownedByAdmittingDoctor(doctorUserId, admissionId);
  if (admission.status !== 'ADMITTED') throw new ConflictError('Round notes can only be added while the patient is admitted');
  return prisma.hospitalRoundNote.create({
    data: { admissionId, authorDoctorProfileId: admission.admittingDoctorProfileId, note: dto.note },
  });
}

// Clinical sign-off. Creates the discharge summary and, if the admission is
// still ADMITTED (admin hasn't separately processed the bed yet), also
// completes the discharge — same "one function does the clinical wrap-up
// and the status transition together" pattern as
// modules/consultations/consultations.service.ts's completeConsultation.
export async function composeDischargeSummary(doctorUserId: string, admissionId: string, dto: z.infer<typeof composeDischargeSummarySchema>) {
  const admission = await ownedByAdmittingDoctor(doctorUserId, admissionId);
  if (admission.status === 'TRANSFERRED_OUT') throw new ConflictError('This patient was transferred out, not discharged here');
  const existing = await prisma.hospitalDischargeSummary.findUnique({ where: { admissionId } });
  if (existing) throw new ConflictError('A discharge summary already exists for this admission');

  const wasAdmitted = admission.status === 'ADMITTED';
  const summary = await prisma.$transaction(async (tx) => {
    const created = await tx.hospitalDischargeSummary.create({
      data: {
        admissionId,
        summary: dto.summary,
        followUpInstructions: dto.followUpInstructions,
        dischargedByDoctorProfileId: admission.admittingDoctorProfileId,
      },
    });
    if (wasAdmitted) {
      await tx.hospitalAdmission.update({ where: { id: admissionId }, data: { status: 'DISCHARGED', dischargedAt: new Date() } });
      await tx.hospitalBed.update({ where: { id: admission.bedId }, data: { status: 'AVAILABLE' } });
    }
    // Surfaces in the patient's record library the same way a released
    // diagnostic report does (modules/diagnostics/orders.service.ts's
    // releaseReport) — Report.kind already has DISCHARGE_SUMMARY reserved
    // for exactly this, unused until now.
    await tx.report.create({
      data: {
        patientUserId: admission.patientUserId,
        kind: 'DISCHARGE_SUMMARY',
        sourceEntityType: 'HospitalAdmission',
        sourceEntityId: admissionId,
        storageKey: '',
        uploadedByUserId: doctorUserId,
      },
    });
    return created;
  });

  if (wasAdmitted) {
    await notify(admission.patientUserId, 'IN_APP', 'hospital.discharged', { admissionId });
  }
  return summary;
}

// Patient portal — read-only history, matching how prescriptions/
// diagnostic reports already surface (modules/diagnostics/*.service.ts's
// listMineAsPatient).
export async function listMineAsPatient(patientUserId: string) {
  return prisma.hospitalAdmission.findMany({
    where: { patientUserId },
    include: admissionDetailInclude(),
    orderBy: { admittedAt: 'desc' },
  });
}
