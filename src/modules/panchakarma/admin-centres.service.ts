import { PanchakarmaCentreVerificationStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { recordAuditEvent } from '@/server/audit';
import type { AuditContext } from '@/server/audit';

// Mirrors modules/diagnostics/admin-labs.service.ts and
// modules/medicines/admin-pharmacies.service.ts's verification workflow —
// a centre's license numbers are identifiers an admin can verify
// externally, not scanned documents that need individual review.

export async function queue(status?: PanchakarmaCentreVerificationStatus) {
  const where: Prisma.PanchakarmaCentreWhereInput = status
    ? { verificationStatus: status }
    : { verificationStatus: { in: [PanchakarmaCentreVerificationStatus.SUBMITTED, PanchakarmaCentreVerificationStatus.UNDER_REVIEW] } };

  const centres = await prisma.panchakarmaCentre.findMany({
    where,
    include: { user: { select: { mobile: true, email: true } } },
    orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
  });

  return {
    total: centres.length,
    centres: centres.map((c) => ({
      id: c.id,
      name: c.name,
      mobile: c.user.mobile,
      email: c.user.email,
      city: c.city,
      licenseNumbers: c.licenseNumbers,
      verificationStatus: c.verificationStatus,
      submittedAt: c.submittedAt,
      rejectionReason: c.rejectionReason,
    })),
  };
}

export async function detail(id: string) {
  const centre = await prisma.panchakarmaCentre.findUnique({
    where: { id },
    include: { user: { select: { id: true, mobile: true, email: true, status: true, createdAt: true } } },
  });
  if (!centre) throw new NotFoundError('Centre application not found');
  return { centre };
}

async function transition(
  id: string,
  adminUserId: string,
  toStatus: PanchakarmaCentreVerificationStatus,
  extra: Prisma.PanchakarmaCentreUpdateInput,
) {
  const centre = await prisma.panchakarmaCentre.findUnique({ where: { id } });
  if (!centre) throw new NotFoundError('Centre application not found');
  return prisma.panchakarmaCentre.update({
    where: { id },
    data: {
      verificationStatus: toStatus,
      reviewedAt: ['APPROVED', 'REJECTED', 'SUSPENDED'].includes(toStatus) ? new Date() : centre.reviewedAt,
      reviewedByUserId: adminUserId,
      ...extra,
    },
  });
}

export async function startReview(id: string, adminCtx: AuditContext & { userId: string }) {
  const centre = await prisma.panchakarmaCentre.findUnique({ where: { id } });
  if (!centre) throw new NotFoundError('Centre application not found');
  if (centre.verificationStatus !== PanchakarmaCentreVerificationStatus.SUBMITTED) {
    throw new BadRequestError('Only submitted applications can enter review');
  }
  const updated = await transition(id, adminCtx.userId, PanchakarmaCentreVerificationStatus.UNDER_REVIEW, { active: false });
  await recordAuditEvent(adminCtx, {
    eventType: 'PANCHAKARMA_CENTRE_VERIFICATION',
    action: 'START_REVIEW',
    resourceType: 'PanchakarmaCentre',
    resourceId: id,
  });
  return { centre: updated };
}

export async function approve(id: string, adminCtx: AuditContext & { userId: string }) {
  const centre = await prisma.panchakarmaCentre.findUnique({ where: { id } });
  if (!centre) throw new NotFoundError('Centre application not found');
  if (
    centre.verificationStatus !== PanchakarmaCentreVerificationStatus.SUBMITTED &&
    centre.verificationStatus !== PanchakarmaCentreVerificationStatus.UNDER_REVIEW
  ) {
    throw new BadRequestError('Application is not ready for approval');
  }
  const updated = await transition(id, adminCtx.userId, PanchakarmaCentreVerificationStatus.APPROVED, {
    active: true,
    rejectionReason: null,
  });
  await recordAuditEvent(adminCtx, {
    eventType: 'PANCHAKARMA_CENTRE_VERIFICATION',
    action: 'APPROVE',
    resourceType: 'PanchakarmaCentre',
    resourceId: id,
  });
  return { centre: updated };
}

export async function reject(id: string, adminCtx: AuditContext & { userId: string }, reason: string) {
  const centre = await prisma.panchakarmaCentre.findUnique({ where: { id } });
  if (!centre) throw new NotFoundError('Centre application not found');
  if (
    centre.verificationStatus !== PanchakarmaCentreVerificationStatus.SUBMITTED &&
    centre.verificationStatus !== PanchakarmaCentreVerificationStatus.UNDER_REVIEW
  ) {
    throw new BadRequestError('Application is not in review');
  }
  const updated = await transition(id, adminCtx.userId, PanchakarmaCentreVerificationStatus.REJECTED, {
    active: false,
    rejectionReason: reason,
  });
  await recordAuditEvent(adminCtx, {
    eventType: 'PANCHAKARMA_CENTRE_VERIFICATION',
    action: 'REJECT',
    resourceType: 'PanchakarmaCentre',
    resourceId: id,
  });
  return { centre: updated };
}

export async function suspend(id: string, adminCtx: AuditContext & { userId: string }, reason: string) {
  const centre = await prisma.panchakarmaCentre.findUnique({ where: { id } });
  if (!centre) throw new NotFoundError('Centre application not found');
  if (centre.verificationStatus !== PanchakarmaCentreVerificationStatus.APPROVED) {
    throw new BadRequestError('Only approved centres can be suspended');
  }
  const updated = await transition(id, adminCtx.userId, PanchakarmaCentreVerificationStatus.SUSPENDED, {
    active: false,
    rejectionReason: reason,
  });
  await recordAuditEvent(adminCtx, {
    eventType: 'PANCHAKARMA_CENTRE_VERIFICATION',
    action: 'SUSPEND',
    resourceType: 'PanchakarmaCentre',
    resourceId: id,
  });
  return { centre: updated };
}
