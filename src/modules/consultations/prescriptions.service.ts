import { prisma } from '@/lib/db';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/lib/errors';
import { notify } from '@/modules/notifications/notifications.service';
import { recordAuditEvent } from '@/server/audit';
import type { AuditContext } from '@/server/audit';
import type { savePrescriptionSchema } from './consultations.schemas';
import type { z } from 'zod';

type SavePrescriptionInput = z.infer<typeof savePrescriptionSchema>;

function itemsData(items: SavePrescriptionInput['items']) {
  return items.map((item) => ({
    productName: item.productName,
    dosage: item.dosage,
    frequency: item.frequency,
    durationDays: item.durationDays,
    route: item.route,
    instructions: item.instructions,
    startDate: item.startDate ? new Date(item.startDate) : undefined,
    endDate: item.endDate ? new Date(item.endDate) : undefined,
  }));
}

async function ownedConsultation(doctorUserId: string, consultationId: string) {
  const consultation = await prisma.consultation.findUnique({ where: { id: consultationId }, include: { doctorProfile: true } });
  if (!consultation || consultation.doctorProfile.userId !== doctorUserId) throw new NotFoundError('Consultation not found');
  return consultation;
}

async function ownedDraftPrescription(doctorUserId: string, prescriptionId: string) {
  const prescription = await prisma.prescription.findUnique({
    where: { id: prescriptionId },
    include: { doctorProfile: true },
  });
  if (!prescription || prescription.doctorProfile.userId !== doctorUserId) throw new NotFoundError('Prescription not found');
  if (prescription.status !== 'DRAFT') {
    throw new ForbiddenError('Finalized prescriptions are read-only — create a correction instead');
  }
  return prescription;
}

export async function createPrescription(doctorUserId: string, consultationId: string, dto: SavePrescriptionInput) {
  const consultation = await ownedConsultation(doctorUserId, consultationId);
  return prisma.prescription.create({
    data: {
      consultationId,
      doctorProfileId: consultation.doctorProfileId,
      patientUserId: consultation.patientUserId,
      doctorNotes: dto.doctorNotes,
      items: { create: itemsData(dto.items) },
    },
    include: { items: true },
  });
}

export async function updatePrescription(doctorUserId: string, prescriptionId: string, dto: SavePrescriptionInput) {
  await ownedDraftPrescription(doctorUserId, prescriptionId);
  return prisma.$transaction(async (tx) => {
    await tx.prescriptionItem.deleteMany({ where: { prescriptionId } });
    return tx.prescription.update({
      where: { id: prescriptionId },
      data: { doctorNotes: dto.doctorNotes, items: { create: itemsData(dto.items) } },
      include: { items: true },
    });
  });
}

export async function finalizePrescription(doctorUserId: string, prescriptionId: string, auditCtx: AuditContext) {
  const prescription = await ownedDraftPrescription(doctorUserId, prescriptionId);
  const itemCount = await prisma.prescriptionItem.count({ where: { prescriptionId } });
  if (itemCount === 0) throw new BadRequestError('Add at least one item before finalizing');

  const finalized = await prisma.prescription.update({
    where: { id: prescriptionId },
    data: { status: 'FINALIZED', finalizedAt: new Date() },
    include: { items: true },
  });

  await recordAuditEvent(auditCtx, {
    eventType: 'PRESCRIPTION',
    action: 'FINALIZED',
    resourceType: 'Prescription',
    resourceId: prescriptionId,
  });
  await notify(prescription.patientUserId, 'IN_APP', 'prescription.finalized', { prescriptionId });

  return finalized;
}

// A finalized prescription is never mutated — a correction creates a new
// DRAFT that supersedes it, seeded from the old one's items as a starting
// point (docs/DOMAIN-MODEL.md §5).
export async function correctPrescription(doctorUserId: string, prescriptionId: string, auditCtx: AuditContext) {
  const original = await prisma.prescription.findUnique({
    where: { id: prescriptionId },
    include: { items: true, doctorProfile: true },
  });
  if (!original || original.doctorProfile.userId !== doctorUserId) throw new NotFoundError('Prescription not found');
  if (original.status !== 'FINALIZED') throw new BadRequestError('Only a finalized prescription can be corrected');

  const correction = await prisma.$transaction(async (tx) => {
    const draft = await tx.prescription.create({
      data: {
        consultationId: original.consultationId,
        doctorProfileId: original.doctorProfileId,
        patientUserId: original.patientUserId,
        supersedesId: original.id,
        doctorNotes: original.doctorNotes,
        items: {
          create: original.items.map((item) => ({
            productName: item.productName,
            dosage: item.dosage,
            frequency: item.frequency,
            durationDays: item.durationDays,
            route: item.route,
            instructions: item.instructions,
            startDate: item.startDate,
            endDate: item.endDate,
          })),
        },
      },
      include: { items: true },
    });
    await tx.prescription.update({ where: { id: original.id }, data: { status: 'SUPERSEDED' } });
    return draft;
  });

  await recordAuditEvent(auditCtx, {
    eventType: 'PRESCRIPTION',
    action: 'CORRECTED',
    resourceType: 'Prescription',
    resourceId: correction.id,
    metadata: { supersedes: original.id },
  });

  return correction;
}
