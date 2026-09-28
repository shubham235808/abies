import { prisma } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { notify } from '@/modules/notifications/notifications.service';
import { recordAuditEvent } from '@/server/audit';
import type { AuditContext } from '@/server/audit';
import type { createRecommendationSchema } from './recommendations.schemas';
import type { z } from 'zod';

type CreateRecommendationInput = z.infer<typeof createRecommendationSchema>;

export async function createRecommendation(doctorUserId: string, consultationId: string, dto: CreateRecommendationInput, auditCtx: AuditContext) {
  const consultation = await prisma.consultation.findUnique({ where: { id: consultationId }, include: { doctorProfile: true } });
  if (!consultation || consultation.doctorProfile.userId !== doctorUserId) throw new NotFoundError('Consultation not found');

  if (dto.carePlanItemId) {
    const item = await prisma.carePlanItem.findFirst({
      where: { id: dto.carePlanItemId, carePlan: { doctorProfileId: consultation.doctorProfileId } },
    });
    if (!item) throw new NotFoundError('Care plan item not found');
  }

  const recommendation = await prisma.diagnosticRecommendation.create({
    data: {
      consultationId,
      doctorProfileId: consultation.doctorProfileId,
      patientUserId: consultation.patientUserId,
      testId: dto.testId,
      packageId: dto.packageId,
      carePlanItemId: dto.carePlanItemId,
      clinicalReason: dto.clinicalReason,
      targetCompletionDate: dto.targetCompletionDate ? new Date(dto.targetCompletionDate) : undefined,
    },
  });

  await recordAuditEvent(auditCtx, {
    eventType: 'DIAGNOSTIC_RECOMMENDATION',
    action: 'CREATED',
    resourceType: 'DiagnosticRecommendation',
    resourceId: recommendation.id,
  });
  await notify(consultation.patientUserId, 'IN_APP', 'diagnostic.recommended', { recommendationId: recommendation.id });

  return recommendation;
}

export async function cancelRecommendation(doctorUserId: string, recommendationId: string) {
  const recommendation = await prisma.diagnosticRecommendation.findUnique({
    where: { id: recommendationId },
    include: { doctorProfile: true },
  });
  if (!recommendation || recommendation.doctorProfile.userId !== doctorUserId) throw new NotFoundError('Recommendation not found');
  if (recommendation.status !== 'RECOMMENDED') {
    throw new NotFoundError('Only a pending recommendation can be cancelled');
  }
  return prisma.diagnosticRecommendation.update({ where: { id: recommendationId }, data: { status: 'CANCELLED' } });
}

export async function listMineAsPatient(patientUserId: string) {
  return prisma.diagnosticRecommendation.findMany({
    where: { patientUserId, status: { not: 'CANCELLED' } },
    include: {
      doctorProfile: { select: { slug: true, title: true, firstName: true, lastName: true } },
      test: { select: { name: true } },
      package: { select: { name: true } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listForConsultation(consultationId: string) {
  return prisma.diagnosticRecommendation.findMany({
    where: { consultationId },
    include: { test: { select: { name: true } }, package: { select: { name: true } } },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listMineAsDoctor(doctorUserId: string) {
  const profile = await prisma.doctorProfile.findUnique({ where: { userId: doctorUserId } });
  if (!profile) throw new NotFoundError('Doctor profile not found');
  return prisma.diagnosticRecommendation.findMany({
    where: { doctorProfileId: profile.id },
    include: {
      patientUser: { select: { mobile: true, patientProfile: { select: { firstName: true, lastName: true } } } },
      test: { select: { name: true } },
      package: { select: { name: true } },
      orders: { include: { report: true }, orderBy: { createdAt: 'desc' }, take: 1 },
    },
    orderBy: { createdAt: 'desc' },
  });
}
