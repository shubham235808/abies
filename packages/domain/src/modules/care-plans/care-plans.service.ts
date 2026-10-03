import type { CarePlanStatus, UserRole } from '@prisma/client';
import { prisma } from '../../lib/db';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { notify } from '../notifications/notifications.service';
import { recordAuditEvent } from '../../server/audit';
import type { AuditContext } from '../../server/audit';
import type {
  createCarePlanItemSchema,
  createCarePlanSchema,
  updateCarePlanDetailsSchema,
  updateCarePlanItemSchema,
} from './care-plans.schemas';
import type { z } from 'zod';

type CreateCarePlanInput = z.infer<typeof createCarePlanSchema>;
type UpdateCarePlanDetailsInput = z.infer<typeof updateCarePlanDetailsSchema>;
type CreateCarePlanItemInput = z.infer<typeof createCarePlanItemSchema>;
type UpdateCarePlanItemInput = z.infer<typeof updateCarePlanItemSchema>;

// docs/DOMAIN-MODEL.md §6 lists the six plan statuses but not a transition
// diagram — this is the state machine actually enforced. Terminal states
// (COMPLETED/CANCELLED/SUPERSEDED) have no way out, matching every other
// terminal status in this codebase (AppointmentStatus, PrescriptionStatus).
const ALLOWED_TRANSITIONS: Record<CarePlanStatus, CarePlanStatus[]> = {
  DRAFT: ['ACTIVE', 'CANCELLED'],
  ACTIVE: ['PAUSED', 'COMPLETED', 'CANCELLED', 'SUPERSEDED'],
  PAUSED: ['ACTIVE', 'COMPLETED', 'CANCELLED'],
  COMPLETED: [],
  CANCELLED: [],
  SUPERSEDED: [],
};

const EDITABLE_STATUSES = new Set<CarePlanStatus>(['DRAFT', 'ACTIVE', 'PAUSED']);

function detailInclude() {
  return {
    items: { orderBy: { createdAt: 'asc' as const } },
    doctorProfile: { select: { userId: true, slug: true, title: true, firstName: true, lastName: true } },
    careRecipientFamilyMember: { select: { name: true } },
    patientUser: { select: { mobile: true, patientProfile: { select: { firstName: true, lastName: true } } } },
  };
}

async function ownedByDoctor(doctorUserId: string, carePlanId: string) {
  const plan = await prisma.carePlan.findUnique({ where: { id: carePlanId }, include: { doctorProfile: true } });
  if (!plan || plan.doctorProfile.userId !== doctorUserId) throw new NotFoundError('Care plan not found');
  return plan;
}

export async function createCarePlan(doctorUserId: string, dto: CreateCarePlanInput, auditCtx: AuditContext) {
  const doctorProfile = await prisma.doctorProfile.findUnique({ where: { userId: doctorUserId } });
  if (!doctorProfile) throw new NotFoundError('Doctor profile not found');

  if (dto.consultationId) {
    const consultation = await prisma.consultation.findUnique({ where: { id: dto.consultationId } });
    if (!consultation || consultation.doctorProfileId !== doctorProfile.id) throw new NotFoundError('Consultation not found');
    if (consultation.patientUserId !== dto.patientUserId) {
      throw new BadRequestError('This consultation does not belong to that patient');
    }
  } else {
    // No specific consultation given — still require a genuine care
    // relationship (any consultation ever, regardless of status) so a
    // doctor can't spin up a plan for a patient they've never treated.
    const hasRelationship = await prisma.consultation.findFirst({
      where: { doctorProfileId: doctorProfile.id, patientUserId: dto.patientUserId },
    });
    if (!hasRelationship) throw new ForbiddenError('No consultation history with this patient yet');
  }

  if (dto.careRecipientFamilyMemberId) {
    const member = await prisma.familyMember.findFirst({
      where: { id: dto.careRecipientFamilyMemberId, patientProfile: { userId: dto.patientUserId } },
    });
    if (!member) throw new BadRequestError('Family member not found');
  }

  const plan = await prisma.carePlan.create({
    data: {
      patientUserId: dto.patientUserId,
      careRecipientFamilyMemberId: dto.careRecipientFamilyMemberId,
      doctorProfileId: doctorProfile.id,
      consultationId: dto.consultationId,
      startDate: new Date(dto.startDate),
      targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
      summary: dto.summary,
      goals: dto.goals ?? [],
    },
    include: detailInclude(),
  });

  await recordAuditEvent(auditCtx, {
    eventType: 'CARE_PLAN',
    action: 'CREATED',
    resourceType: 'CarePlan',
    resourceId: plan.id,
  });

  return plan;
}

export async function updateCarePlanDetails(doctorUserId: string, planId: string, dto: UpdateCarePlanDetailsInput) {
  const plan = await ownedByDoctor(doctorUserId, planId);
  if (!EDITABLE_STATUSES.has(plan.status)) throw new ForbiddenError('This care plan can no longer be edited');
  return prisma.carePlan.update({
    where: { id: planId },
    data: {
      summary: dto.summary,
      targetDate: dto.targetDate ? new Date(dto.targetDate) : undefined,
      goals: dto.goals,
    },
    include: detailInclude(),
  });
}

export async function transitionCarePlan(doctorUserId: string, planId: string, toStatus: CarePlanStatus, auditCtx: AuditContext) {
  const plan = await ownedByDoctor(doctorUserId, planId);
  const allowed = ALLOWED_TRANSITIONS[plan.status];
  if (!allowed.includes(toStatus)) {
    throw new BadRequestError(`A ${plan.status} care plan cannot move to ${toStatus}`);
  }

  const updated = await prisma.carePlan.update({ where: { id: planId }, data: { status: toStatus }, include: detailInclude() });

  await recordAuditEvent(auditCtx, {
    eventType: 'CARE_PLAN',
    action: 'STATUS_CHANGED',
    resourceType: 'CarePlan',
    resourceId: planId,
    metadata: { from: plan.status, to: toStatus },
  });
  if (plan.status === 'DRAFT' && toStatus === 'ACTIVE') {
    await notify(plan.patientUserId, 'IN_APP', 'careplan.activated', { carePlanId: planId });
  }

  return updated;
}

export async function addCarePlanItem(doctorUserId: string, planId: string, dto: CreateCarePlanItemInput) {
  const plan = await ownedByDoctor(doctorUserId, planId);
  if (!EDITABLE_STATUSES.has(plan.status)) throw new ForbiddenError('This care plan can no longer be edited');

  return prisma.carePlanItem.create({
    data: {
      carePlanId: planId,
      type: dto.type,
      title: dto.title,
      description: dto.description,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      relatedEntityType: dto.relatedEntityType,
      relatedEntityId: dto.relatedEntityId,
      ownerUserId: dto.ownerUserId,
      notes: dto.notes,
    },
  });
}

// Clinical content only a doctor may touch (docs/DOMAIN-MODEL.md §6) —
// title/description/type/relatedEntity/status. Deliberately separate from
// acknowledgeCarePlanItem below, which a patient calls and which can never
// reach this function's data path.
export async function updateCarePlanItem(doctorUserId: string, itemId: string, dto: UpdateCarePlanItemInput) {
  const item = await prisma.carePlanItem.findUnique({
    where: { id: itemId },
    include: { carePlan: { include: { doctorProfile: true } } },
  });
  if (!item || item.carePlan.doctorProfile.userId !== doctorUserId) throw new NotFoundError('Care plan item not found');
  if (!EDITABLE_STATUSES.has(item.carePlan.status)) throw new ForbiddenError('This care plan can no longer be edited');

  return prisma.carePlanItem.update({
    where: { id: itemId },
    data: {
      type: dto.type,
      title: dto.title,
      description: dto.description,
      startDate: dto.startDate ? new Date(dto.startDate) : undefined,
      dueDate: dto.dueDate ? new Date(dto.dueDate) : undefined,
      relatedEntityType: dto.relatedEntityType,
      relatedEntityId: dto.relatedEntityId,
      ownerUserId: dto.ownerUserId,
      notes: dto.notes,
      status: dto.status,
      completedDate: dto.status ? (dto.status === 'COMPLETED' ? new Date() : null) : undefined,
    },
  });
}

// The patient-facing "I did this" flag (docs/DOMAIN-MODEL.md §6) — never
// touches `status`, which stays entirely clinician-owned.
export async function acknowledgeCarePlanItem(patientUserId: string, itemId: string, done: boolean) {
  const item = await prisma.carePlanItem.findUnique({ where: { id: itemId }, include: { carePlan: true } });
  if (!item || item.carePlan.patientUserId !== patientUserId || item.carePlan.status === 'DRAFT') {
    throw new NotFoundError('Care plan item not found');
  }
  return prisma.carePlanItem.update({
    where: { id: itemId },
    data: { patientMarkedDoneAt: done ? new Date() : null },
  });
}

export async function getCarePlan(userId: string, role: UserRole, planId: string) {
  const plan = await prisma.carePlan.findUnique({ where: { id: planId }, include: detailInclude() });
  if (!plan) throw new NotFoundError('Care plan not found');

  const isDoctor = role === 'DOCTOR' && plan.doctorProfile.userId === userId;
  const isPatient = role === 'PATIENT' && plan.patientUserId === userId;
  if (!isDoctor && !isPatient) throw new NotFoundError('Care plan not found');
  // A DRAFT plan is the doctor's own working draft — not yet shared, same
  // pattern as an unfinalized ClinicalNote in modules/consultations.
  if (isPatient && plan.status === 'DRAFT') throw new NotFoundError('Care plan not found');

  return plan;
}

export async function listMineAsDoctor(userId: string) {
  const profile = await prisma.doctorProfile.findUnique({ where: { userId } });
  if (!profile) throw new NotFoundError('Doctor profile not found');
  return prisma.carePlan.findMany({
    where: { doctorProfileId: profile.id },
    include: {
      patientUser: { select: { mobile: true, patientProfile: { select: { firstName: true, lastName: true } } } },
      careRecipientFamilyMember: { select: { name: true } },
      items: { select: { id: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listMineAsPatient(userId: string) {
  return prisma.carePlan.findMany({
    where: { patientUserId: userId, status: { not: 'DRAFT' } },
    include: {
      doctorProfile: { select: { slug: true, title: true, firstName: true, lastName: true } },
      careRecipientFamilyMember: { select: { name: true } },
      items: { select: { id: true, status: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

// For the "create/view care plan" entry point on a doctor's consultation
// workspace — plans between this doctor and patient aren't limited to the
// one consultation being viewed (a plan can span several visits), so this
// looks at the whole relationship rather than filtering by consultationId.
export async function listForDoctorPatientPair(doctorUserId: string, patientUserId: string) {
  const profile = await prisma.doctorProfile.findUnique({ where: { userId: doctorUserId } });
  if (!profile) throw new NotFoundError('Doctor profile not found');
  return prisma.carePlan.findMany({
    where: { doctorProfileId: profile.id, patientUserId },
    select: { id: true, status: true, summary: true, createdAt: true },
    orderBy: { createdAt: 'desc' },
  });
}

// Care Coordinator's "unified patient work queue" (docs/TARGET-ARCHITECTURE.md
// portal description) — read-only, no new schema: an item is at-risk once
// it's MISSED outright, or still open (PLANNED/ACTIVE) with a due date
// already passed or landing within the next 2 days. Coordinators help
// patients complete the plan; they don't edit clinical items themselves
// (that stays the doctor's call), so this list is deliberately view-only —
// escalation happens by opening a support ticket linked to the patient.
export async function listAtRiskItems() {
  const horizon = new Date(Date.now() + 2 * 24 * 60 * 60 * 1000);
  return prisma.carePlanItem.findMany({
    where: {
      OR: [{ status: 'MISSED' }, { status: { in: ['PLANNED', 'ACTIVE'] }, dueDate: { lte: horizon } }],
      carePlan: { status: 'ACTIVE' },
    },
    include: {
      carePlan: {
        select: {
          patientUserId: true,
          patientUser: { select: { mobile: true, patientProfile: { select: { firstName: true, lastName: true } } } },
          doctorProfile: { select: { firstName: true, lastName: true } },
        },
      },
    },
    orderBy: { dueDate: 'asc' },
  });
}
