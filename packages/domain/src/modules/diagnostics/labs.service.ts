import { DiagnosticLabVerificationStatus } from '@prisma/client';
import { prisma } from '../../lib/db';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { recordAuditEvent } from '../../server/audit';
import type { AuditContext } from '../../server/audit';
import type { updateLabProfileSchema } from './labs.schemas';
import type { z } from 'zod';

type UpdateLabProfileInput = z.infer<typeof updateLabProfileSchema>;

function editableStatus(status: DiagnosticLabVerificationStatus): boolean {
  return status === DiagnosticLabVerificationStatus.DRAFT || status === DiagnosticLabVerificationStatus.REJECTED;
}

export async function ensureLabProfile(userId: string) {
  const existing = await prisma.diagnosticLab.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.diagnosticLab.create({ data: { userId } });
}

export async function getMyLab(userId: string) {
  const lab = await ensureLabProfile(userId);
  return { lab };
}

export async function updateMyLab(userId: string, dto: UpdateLabProfileInput, auditCtx: AuditContext) {
  const lab = await ensureLabProfile(userId);
  if (!editableStatus(lab.verificationStatus)) {
    throw new ForbiddenError('Lab details are locked while verification is in progress or approved. Contact support for regulated changes.');
  }
  const updated = await prisma.diagnosticLab.update({
    where: { id: lab.id },
    data: dto,
  });
  await recordAuditEvent(auditCtx, {
    eventType: 'DIAGNOSTIC_LAB',
    action: 'UPDATE',
    resourceType: 'DiagnosticLab',
    resourceId: lab.id,
    metadata: { fields: Object.keys(dto) },
  });
  return { lab: updated };
}

export async function submitLab(userId: string, declarationAccepted: boolean, auditCtx: AuditContext) {
  if (!declarationAccepted) throw new BadRequestError('The partner declaration must be accepted');
  const lab = await ensureLabProfile(userId);
  if (!editableStatus(lab.verificationStatus)) {
    throw new BadRequestError('Application is not in a submittable state');
  }

  const missing: string[] = [];
  if (!lab.name) missing.push('lab name');
  if (!lab.licenseNumbers.length) missing.push('at least one license number');
  if (!lab.serviceCities.length) missing.push('at least one service city');
  if (missing.length) throw new BadRequestError(`Complete the following before submitting: ${missing.join(', ')}`);

  const updated = await prisma.diagnosticLab.update({
    where: { id: lab.id },
    data: { verificationStatus: DiagnosticLabVerificationStatus.SUBMITTED, submittedAt: new Date(), rejectionReason: null },
  });
  await recordAuditEvent(auditCtx, {
    eventType: 'DIAGNOSTIC_LAB_VERIFICATION',
    action: 'SUBMIT',
    resourceType: 'DiagnosticLab',
    resourceId: lab.id,
  });
  return { lab: updated };
}

export async function requireApprovedLab(userId: string) {
  const lab = await prisma.diagnosticLab.findUnique({ where: { userId } });
  if (!lab || lab.verificationStatus !== DiagnosticLabVerificationStatus.APPROVED) {
    throw new NotFoundError('Lab profile not found or not approved');
  }
  return lab;
}
