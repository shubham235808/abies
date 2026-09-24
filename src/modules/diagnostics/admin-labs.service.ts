import { DiagnosticLabVerificationStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { recordAuditEvent } from '@/server/audit';
import type { AuditContext } from '@/server/audit';

// Mirrors modules/doctors/admin-doctors.service.ts's verification workflow,
// minus the per-document review gate — a lab's license numbers are
// identifiers an admin can verify externally (see the schema comment on
// DiagnosticLab), not scanned documents that need individual review.

export async function queue(status?: DiagnosticLabVerificationStatus) {
  const where: Prisma.DiagnosticLabWhereInput = status
    ? { verificationStatus: status }
    : { verificationStatus: { in: [DiagnosticLabVerificationStatus.SUBMITTED, DiagnosticLabVerificationStatus.UNDER_REVIEW] } };

  const labs = await prisma.diagnosticLab.findMany({
    where,
    include: { user: { select: { mobile: true, email: true } } },
    orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
  });

  return {
    total: labs.length,
    labs: labs.map((l) => ({
      id: l.id,
      name: l.name,
      mobile: l.user.mobile,
      email: l.user.email,
      licenseNumbers: l.licenseNumbers,
      serviceCities: l.serviceCities,
      verificationStatus: l.verificationStatus,
      submittedAt: l.submittedAt,
      rejectionReason: l.rejectionReason,
    })),
  };
}

export async function detail(id: string) {
  const lab = await prisma.diagnosticLab.findUnique({
    where: { id },
    include: { user: { select: { id: true, mobile: true, email: true, status: true, createdAt: true } } },
  });
  if (!lab) throw new NotFoundError('Lab application not found');
  return { lab };
}

async function transition(
  id: string,
  adminUserId: string,
  toStatus: DiagnosticLabVerificationStatus,
  extra: Prisma.DiagnosticLabUpdateInput,
) {
  const lab = await prisma.diagnosticLab.findUnique({ where: { id } });
  if (!lab) throw new NotFoundError('Lab application not found');
  return prisma.diagnosticLab.update({
    where: { id },
    data: {
      verificationStatus: toStatus,
      reviewedAt: ['APPROVED', 'REJECTED', 'SUSPENDED'].includes(toStatus) ? new Date() : lab.reviewedAt,
      reviewedByUserId: adminUserId,
      ...extra,
    },
  });
}

export async function startReview(id: string, adminCtx: AuditContext & { userId: string }) {
  const lab = await prisma.diagnosticLab.findUnique({ where: { id } });
  if (!lab) throw new NotFoundError('Lab application not found');
  if (lab.verificationStatus !== DiagnosticLabVerificationStatus.SUBMITTED) {
    throw new BadRequestError('Only submitted applications can enter review');
  }
  const updated = await transition(id, adminCtx.userId, DiagnosticLabVerificationStatus.UNDER_REVIEW, { active: false });
  await recordAuditEvent(adminCtx, {
    eventType: 'DIAGNOSTIC_LAB_VERIFICATION',
    action: 'START_REVIEW',
    resourceType: 'DiagnosticLab',
    resourceId: id,
  });
  return { lab: updated };
}

export async function approve(id: string, adminCtx: AuditContext & { userId: string }) {
  const lab = await prisma.diagnosticLab.findUnique({ where: { id } });
  if (!lab) throw new NotFoundError('Lab application not found');
  if (
    lab.verificationStatus !== DiagnosticLabVerificationStatus.SUBMITTED &&
    lab.verificationStatus !== DiagnosticLabVerificationStatus.UNDER_REVIEW
  ) {
    throw new BadRequestError('Application is not ready for approval');
  }
  const updated = await transition(id, adminCtx.userId, DiagnosticLabVerificationStatus.APPROVED, {
    active: true,
    rejectionReason: null,
  });
  await recordAuditEvent(adminCtx, {
    eventType: 'DIAGNOSTIC_LAB_VERIFICATION',
    action: 'APPROVE',
    resourceType: 'DiagnosticLab',
    resourceId: id,
  });
  return { lab: updated };
}

export async function reject(id: string, adminCtx: AuditContext & { userId: string }, reason: string) {
  const lab = await prisma.diagnosticLab.findUnique({ where: { id } });
  if (!lab) throw new NotFoundError('Lab application not found');
  if (
    lab.verificationStatus !== DiagnosticLabVerificationStatus.SUBMITTED &&
    lab.verificationStatus !== DiagnosticLabVerificationStatus.UNDER_REVIEW
  ) {
    throw new BadRequestError('Application is not in review');
  }
  const updated = await transition(id, adminCtx.userId, DiagnosticLabVerificationStatus.REJECTED, {
    active: false,
    rejectionReason: reason,
  });
  await recordAuditEvent(adminCtx, {
    eventType: 'DIAGNOSTIC_LAB_VERIFICATION',
    action: 'REJECT',
    resourceType: 'DiagnosticLab',
    resourceId: id,
  });
  return { lab: updated };
}

export async function suspend(id: string, adminCtx: AuditContext & { userId: string }, reason: string) {
  const lab = await prisma.diagnosticLab.findUnique({ where: { id } });
  if (!lab) throw new NotFoundError('Lab application not found');
  if (lab.verificationStatus !== DiagnosticLabVerificationStatus.APPROVED) {
    throw new BadRequestError('Only approved labs can be suspended');
  }
  const updated = await transition(id, adminCtx.userId, DiagnosticLabVerificationStatus.SUSPENDED, {
    active: false,
    rejectionReason: reason,
  });
  await recordAuditEvent(adminCtx, {
    eventType: 'DIAGNOSTIC_LAB_VERIFICATION',
    action: 'SUSPEND',
    resourceType: 'DiagnosticLab',
    resourceId: id,
  });
  return { lab: updated };
}
