import { PharmacyVerificationStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/db';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { recordAuditEvent } from '../../server/audit';
import type { AuditContext } from '../../server/audit';

// Mirrors modules/diagnostics/admin-labs.service.ts's verification workflow
// — a pharmacy's license numbers are identifiers an admin can verify
// externally, not scanned documents that need individual review.

export async function queue(status?: PharmacyVerificationStatus) {
  const where: Prisma.PharmacyWhereInput = status
    ? { verificationStatus: status }
    : { verificationStatus: { in: [PharmacyVerificationStatus.SUBMITTED, PharmacyVerificationStatus.UNDER_REVIEW] } };

  const pharmacies = await prisma.pharmacy.findMany({
    where,
    include: { user: { select: { mobile: true, email: true } } },
    orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
  });

  return {
    total: pharmacies.length,
    pharmacies: pharmacies.map((p) => ({
      id: p.id,
      name: p.name,
      mobile: p.user.mobile,
      email: p.user.email,
      licenseNumbers: p.licenseNumbers,
      serviceAreas: p.serviceAreas,
      verificationStatus: p.verificationStatus,
      submittedAt: p.submittedAt,
      rejectionReason: p.rejectionReason,
    })),
  };
}

export async function detail(id: string) {
  const pharmacy = await prisma.pharmacy.findUnique({
    where: { id },
    include: { user: { select: { id: true, mobile: true, email: true, status: true, createdAt: true } } },
  });
  if (!pharmacy) throw new NotFoundError('Pharmacy application not found');
  return { pharmacy };
}

async function transition(
  id: string,
  adminUserId: string,
  toStatus: PharmacyVerificationStatus,
  extra: Prisma.PharmacyUpdateInput,
) {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id } });
  if (!pharmacy) throw new NotFoundError('Pharmacy application not found');
  return prisma.pharmacy.update({
    where: { id },
    data: {
      verificationStatus: toStatus,
      reviewedAt: ['APPROVED', 'REJECTED', 'SUSPENDED'].includes(toStatus) ? new Date() : pharmacy.reviewedAt,
      reviewedByUserId: adminUserId,
      ...extra,
    },
  });
}

export async function startReview(id: string, adminCtx: AuditContext & { userId: string }) {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id } });
  if (!pharmacy) throw new NotFoundError('Pharmacy application not found');
  if (pharmacy.verificationStatus !== PharmacyVerificationStatus.SUBMITTED) {
    throw new BadRequestError('Only submitted applications can enter review');
  }
  const updated = await transition(id, adminCtx.userId, PharmacyVerificationStatus.UNDER_REVIEW, { active: false });
  await recordAuditEvent(adminCtx, {
    eventType: 'PHARMACY_VERIFICATION',
    action: 'START_REVIEW',
    resourceType: 'Pharmacy',
    resourceId: id,
  });
  return { pharmacy: updated };
}

export async function approve(id: string, adminCtx: AuditContext & { userId: string }) {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id } });
  if (!pharmacy) throw new NotFoundError('Pharmacy application not found');
  if (
    pharmacy.verificationStatus !== PharmacyVerificationStatus.SUBMITTED &&
    pharmacy.verificationStatus !== PharmacyVerificationStatus.UNDER_REVIEW
  ) {
    throw new BadRequestError('Application is not ready for approval');
  }
  const updated = await transition(id, adminCtx.userId, PharmacyVerificationStatus.APPROVED, {
    active: true,
    rejectionReason: null,
  });
  await recordAuditEvent(adminCtx, {
    eventType: 'PHARMACY_VERIFICATION',
    action: 'APPROVE',
    resourceType: 'Pharmacy',
    resourceId: id,
  });
  return { pharmacy: updated };
}

export async function reject(id: string, adminCtx: AuditContext & { userId: string }, reason: string) {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id } });
  if (!pharmacy) throw new NotFoundError('Pharmacy application not found');
  if (
    pharmacy.verificationStatus !== PharmacyVerificationStatus.SUBMITTED &&
    pharmacy.verificationStatus !== PharmacyVerificationStatus.UNDER_REVIEW
  ) {
    throw new BadRequestError('Application is not in review');
  }
  const updated = await transition(id, adminCtx.userId, PharmacyVerificationStatus.REJECTED, {
    active: false,
    rejectionReason: reason,
  });
  await recordAuditEvent(adminCtx, {
    eventType: 'PHARMACY_VERIFICATION',
    action: 'REJECT',
    resourceType: 'Pharmacy',
    resourceId: id,
  });
  return { pharmacy: updated };
}

export async function suspend(id: string, adminCtx: AuditContext & { userId: string }, reason: string) {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { id } });
  if (!pharmacy) throw new NotFoundError('Pharmacy application not found');
  if (pharmacy.verificationStatus !== PharmacyVerificationStatus.APPROVED) {
    throw new BadRequestError('Only approved pharmacies can be suspended');
  }
  const updated = await transition(id, adminCtx.userId, PharmacyVerificationStatus.SUSPENDED, {
    active: false,
    rejectionReason: reason,
  });
  await recordAuditEvent(adminCtx, {
    eventType: 'PHARMACY_VERIFICATION',
    action: 'SUSPEND',
    resourceType: 'Pharmacy',
    resourceId: id,
  });
  return { pharmacy: updated };
}
