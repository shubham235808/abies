import { PanchakarmaCentreVerificationStatus } from '@prisma/client';
import { prisma } from '../../lib/db';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { recordAuditEvent } from '../../server/audit';
import type { AuditContext } from '../../server/audit';
import type { updateCentreProfileSchema } from './centres.schemas';
import type { z } from 'zod';

type UpdateCentreProfileInput = z.infer<typeof updateCentreProfileSchema>;

function editableStatus(status: PanchakarmaCentreVerificationStatus): boolean {
  return status === PanchakarmaCentreVerificationStatus.DRAFT || status === PanchakarmaCentreVerificationStatus.REJECTED;
}

export async function ensureCentreProfile(userId: string) {
  const existing = await prisma.panchakarmaCentre.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.panchakarmaCentre.create({ data: { userId } });
}

export async function getMyCentre(userId: string) {
  const centre = await ensureCentreProfile(userId);
  return { centre };
}

export async function updateMyCentre(userId: string, dto: UpdateCentreProfileInput, auditCtx: AuditContext) {
  const centre = await ensureCentreProfile(userId);
  if (!editableStatus(centre.verificationStatus)) {
    throw new ForbiddenError('Centre details are locked while verification is in progress or approved. Contact support for regulated changes.');
  }
  const updated = await prisma.panchakarmaCentre.update({
    where: { id: centre.id },
    data: dto,
  });
  await recordAuditEvent(auditCtx, {
    eventType: 'PANCHAKARMA_CENTRE',
    action: 'UPDATE',
    resourceType: 'PanchakarmaCentre',
    resourceId: centre.id,
    metadata: { fields: Object.keys(dto) },
  });
  return { centre: updated };
}

export async function submitCentre(userId: string, declarationAccepted: boolean, auditCtx: AuditContext) {
  if (!declarationAccepted) throw new BadRequestError('The partner declaration must be accepted');
  const centre = await ensureCentreProfile(userId);
  if (!editableStatus(centre.verificationStatus)) {
    throw new BadRequestError('Application is not in a submittable state');
  }

  const missing: string[] = [];
  if (!centre.name) missing.push('centre name');
  if (!centre.addressLine1 || !centre.city || !centre.state || !centre.postalCode) missing.push('full address');
  if (!centre.supervisingPractitioner) missing.push('supervising practitioner');
  if (!centre.licenseNumbers.length) missing.push('at least one license number');
  if (missing.length) throw new BadRequestError(`Complete the following before submitting: ${missing.join(', ')}`);

  const updated = await prisma.panchakarmaCentre.update({
    where: { id: centre.id },
    data: { verificationStatus: PanchakarmaCentreVerificationStatus.SUBMITTED, submittedAt: new Date(), rejectionReason: null },
  });
  await recordAuditEvent(auditCtx, {
    eventType: 'PANCHAKARMA_CENTRE_VERIFICATION',
    action: 'SUBMIT',
    resourceType: 'PanchakarmaCentre',
    resourceId: centre.id,
  });
  return { centre: updated };
}

export async function requireApprovedCentre(userId: string) {
  const centre = await prisma.panchakarmaCentre.findUnique({ where: { userId } });
  if (!centre || centre.verificationStatus !== PanchakarmaCentreVerificationStatus.APPROVED) {
    throw new NotFoundError('Centre profile not found or not approved');
  }
  return centre;
}

// Powers the centre-picker in the "book a recommended therapy" flow, and
// the public /panchakarma catalogue's facets.
export async function listApprovedCentres(city?: string) {
  return prisma.panchakarmaCentre.findMany({
    where: {
      verificationStatus: PanchakarmaCentreVerificationStatus.APPROVED,
      active: true,
      ...(city ? { city } : {}),
    },
    select: { id: true, name: true, city: true, state: true },
    orderBy: { name: 'asc' },
  });
}
