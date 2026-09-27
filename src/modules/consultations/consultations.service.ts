import type { UserRole } from '@prisma/client';
import { prisma } from '@/lib/db';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/lib/errors';
import { notify } from '@/modules/notifications/notifications.service';
import { recordAuditEvent } from '@/server/audit';
import type { AuditContext } from '@/server/audit';
import type { saveClinicalNoteSchema, updateConsultationDetailsSchema } from './consultations.schemas';
import type { z } from 'zod';

type UpdateDetailsInput = z.infer<typeof updateConsultationDetailsSchema>;
type SaveClinicalNoteInput = z.infer<typeof saveClinicalNoteSchema>;

function detailInclude() {
  return {
    appointment: true,
    doctorProfile: { select: { userId: true, slug: true, title: true, firstName: true, lastName: true } },
    patientUser: { select: { id: true, mobile: true, patientProfile: { select: { firstName: true, lastName: true } } } },
    videoSession: true,
    clinicalNote: true,
    prescriptions: { include: { items: true }, orderBy: { createdAt: 'desc' as const } },
  };
}

async function ownedByDoctor(doctorUserId: string, consultationId: string) {
  const consultation = await prisma.consultation.findUnique({
    where: { id: consultationId },
    include: { doctorProfile: true },
  });
  if (!consultation || consultation.doctorProfile.userId !== doctorUserId) {
    throw new NotFoundError('Consultation not found');
  }
  return consultation;
}

export async function listActiveAssessmentFields() {
  return prisma.assessmentTemplateField.findMany({ where: { active: true }, orderBy: { sortOrder: 'asc' } });
}

export async function getConsultation(userId: string, role: UserRole, consultationId: string) {
  const consultation = await prisma.consultation.findUnique({ where: { id: consultationId }, include: detailInclude() });
  if (!consultation) throw new NotFoundError('Consultation not found');

  const isDoctor = role === 'DOCTOR' && consultation.doctorProfile.userId === userId;
  const isPatient = role === 'PATIENT' && consultation.patientUserId === userId;
  if (!isDoctor && !isPatient) throw new NotFoundError('Consultation not found');

  if (isPatient) {
    // A patient never sees the doctor's working draft — only what's been
    // signed off (docs/DOMAIN-MODEL.md §5/§6 pattern: clinical content stays
    // clinician-owned until finalized). `notes` is the doctor's own
    // free-form scratch pad, never patient-visible at any stage.
    return {
      ...consultation,
      notes: null,
      clinicalNote: consultation.clinicalNote?.finalizedAt ? consultation.clinicalNote : null,
      prescriptions: consultation.prescriptions.filter((p) => p.status !== 'DRAFT'),
    };
  }
  return consultation;
}

export async function startConsultation(doctorUserId: string, consultationId: string) {
  const consultation = await ownedByDoctor(doctorUserId, consultationId);
  if (consultation.status !== 'SCHEDULED') {
    throw new BadRequestError('This consultation has already started or ended');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.consultation.update({
      where: { id: consultationId },
      data: { status: 'IN_PROGRESS', startedAt: new Date() },
    });
    const appointment = await tx.appointment.findUniqueOrThrow({ where: { id: consultation.appointmentId } });
    if (appointment.mode === 'VIDEO') {
      await tx.videoSession.upsert({
        where: { consultationId },
        update: {},
        create: {
          consultationId,
          joinWindowStart: appointment.scheduledAt,
          joinWindowEnd: new Date(appointment.scheduledAt.getTime() + appointment.durationMinutes * 60_000),
        },
      });
    }
    return result;
  });

  await notify(consultation.patientUserId, 'IN_APP', 'consultation.started', { consultationId });
  return updated;
}

// Called when either party opens a VIDEO consultation's page — real,
// low-stakes tracking data (there's no actual call to join yet; see
// src/lib/video), idempotent so repeat visits don't overwrite the first
// join time.
export async function recordJoin(userId: string, role: UserRole, consultationId: string) {
  const consultation = await prisma.consultation.findUnique({ where: { id: consultationId }, include: { doctorProfile: true } });
  if (!consultation) return;
  const isDoctor = role === 'DOCTOR' && consultation.doctorProfile.userId === userId;
  const isPatient = role === 'PATIENT' && consultation.patientUserId === userId;
  if (!isDoctor && !isPatient) return;

  const session = await prisma.videoSession.findUnique({ where: { consultationId } });
  if (!session) return;
  if (isDoctor && !session.doctorJoinedAt) {
    await prisma.videoSession.update({ where: { consultationId }, data: { doctorJoinedAt: new Date() } });
  }
  if (isPatient && !session.patientJoinedAt) {
    await prisma.videoSession.update({ where: { consultationId }, data: { patientJoinedAt: new Date() } });
  }
}

export async function updateConsultationDetails(doctorUserId: string, consultationId: string, dto: UpdateDetailsInput) {
  const consultation = await ownedByDoctor(doctorUserId, consultationId);
  if (consultation.status === 'COMPLETED' || consultation.status === 'CANCELLED') {
    throw new ForbiddenError('This consultation has ended and can no longer be edited');
  }
  return prisma.consultation.update({ where: { id: consultationId }, data: dto });
}

export async function completeConsultation(doctorUserId: string, consultationId: string, dto: UpdateDetailsInput, auditCtx: AuditContext) {
  const consultation = await ownedByDoctor(doctorUserId, consultationId);
  if (consultation.status !== 'SCHEDULED' && consultation.status !== 'IN_PROGRESS') {
    throw new BadRequestError('This consultation has already ended');
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.consultation.update({
      where: { id: consultationId },
      data: { ...dto, status: 'COMPLETED', endedAt: new Date() },
    });
    await tx.appointment.update({ where: { id: consultation.appointmentId }, data: { status: 'COMPLETED' } });
    return result;
  });

  await recordAuditEvent(auditCtx, {
    eventType: 'CONSULTATION',
    action: 'COMPLETED',
    resourceType: 'Consultation',
    resourceId: consultationId,
  });
  await notify(consultation.patientUserId, 'IN_APP', 'consultation.completed', { consultationId });

  return updated;
}

export async function saveClinicalNote(doctorUserId: string, consultationId: string, dto: SaveClinicalNoteInput) {
  await ownedByDoctor(doctorUserId, consultationId);
  const existing = await prisma.clinicalNote.findUnique({ where: { consultationId } });
  if (existing?.finalizedAt) {
    throw new ForbiddenError('This clinical note has been finalized and can no longer be edited');
  }

  const data = {
    ayurvedaAssessment: (dto.ayurvedaAssessment ?? {}) as never,
    diagnosis: dto.diagnosis,
    treatmentPlan: dto.treatmentPlan,
    recommendations: dto.recommendations,
    followUpDate: dto.followUpDate ? new Date(dto.followUpDate) : undefined,
  };

  return prisma.clinicalNote.upsert({
    where: { consultationId },
    update: data,
    create: { consultationId, ...data },
  });
}

export async function finalizeClinicalNote(doctorUserId: string, consultationId: string, auditCtx: AuditContext) {
  const consultation = await ownedByDoctor(doctorUserId, consultationId);
  const note = await prisma.clinicalNote.findUnique({ where: { consultationId } });
  if (!note) throw new BadRequestError('Save the clinical note before finalizing it');
  if (note.finalizedAt) throw new ForbiddenError('This clinical note has already been finalized');

  const finalized = await prisma.clinicalNote.update({ where: { consultationId }, data: { finalizedAt: new Date() } });

  await recordAuditEvent(auditCtx, {
    eventType: 'CONSULTATION',
    action: 'CLINICAL_NOTE_FINALIZED',
    resourceType: 'ClinicalNote',
    resourceId: finalized.id,
  });
  await notify(consultation.patientUserId, 'IN_APP', 'consultation.note_finalized', { consultationId });

  return finalized;
}

// Doctor dashboard's "Tasks requiring attention" (docs/PORTAL-UX-SPEC.md) —
// computed from real state, not invented: a completed consultation with no
// finalized clinical note, or with a prescription still sitting in DRAFT.
// Deliberately excludes anything already finalized/no-prescription-needed;
// this is a work list, not a full history.
export async function listTasksNeedingAttention(doctorUserId: string) {
  const profile = await prisma.doctorProfile.findUnique({ where: { userId: doctorUserId } });
  if (!profile) throw new NotFoundError('Doctor profile not found');

  const consultations = await prisma.consultation.findMany({
    where: { doctorProfileId: profile.id, status: 'COMPLETED' },
    include: {
      patientUser: { select: { patientProfile: { select: { firstName: true, lastName: true } } } },
      clinicalNote: { select: { finalizedAt: true } },
      prescriptions: { select: { status: true }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { endedAt: 'desc' },
    take: 20,
  });

  return consultations
    .filter((c) => !c.clinicalNote?.finalizedAt || c.prescriptions[0]?.status === 'DRAFT')
    .map((c) => ({
      consultationId: c.id,
      patientName: [c.patientUser.patientProfile?.firstName, c.patientUser.patientProfile?.lastName].filter(Boolean).join(' ') || 'Patient',
      reason: !c.clinicalNote?.finalizedAt ? ('Clinical note not finalized' as const) : ('Prescription still in draft' as const),
      endedAt: c.endedAt,
    }));
}
