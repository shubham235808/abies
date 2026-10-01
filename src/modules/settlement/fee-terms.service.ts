import { prisma } from '@/lib/db';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { recordAuditEvent } from '@/server/audit';
import type { AuditContext } from '@/server/audit';
import type { createFeeTermSchema, updateFeeTermSchema } from './settlement.schemas';
import type { z } from 'zod';

export async function listFeeTerms() {
  return prisma.partnerFeeTerm.findMany({ orderBy: [{ partnerKind: 'asc' }, { effectiveFrom: 'desc' }] });
}

export async function createFeeTerm(dto: z.infer<typeof createFeeTermSchema>, createdByUserId: string, auditCtx: AuditContext) {
  if (dto.feeModel === 'PERCENTAGE' && dto.rateBasisPoints === undefined) {
    throw new BadRequestError('A percentage fee term needs a rate');
  }
  if (dto.feeModel === 'FIXED' && dto.fixedAmount === undefined) {
    throw new BadRequestError('A fixed fee term needs an amount');
  }
  const row = await prisma.partnerFeeTerm.create({
    data: {
      partnerKind: dto.partnerKind,
      partnerId: dto.partnerId,
      feeModel: dto.feeModel,
      rateBasisPoints: dto.feeModel === 'PERCENTAGE' ? dto.rateBasisPoints : null,
      fixedAmount: dto.feeModel === 'FIXED' ? dto.fixedAmount : null,
      effectiveFrom: new Date(dto.effectiveFrom),
      effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : null,
      createdByUserId,
    },
  });
  await recordAuditEvent(auditCtx, {
    eventType: 'SETTLEMENT',
    action: 'FEE_TERM_CREATED',
    resourceType: 'PartnerFeeTerm',
    resourceId: row.id,
    metadata: { partnerKind: row.partnerKind, partnerId: row.partnerId },
  });
  return row;
}

export async function updateFeeTerm(id: string, dto: z.infer<typeof updateFeeTermSchema>, auditCtx: AuditContext) {
  const existing = await prisma.partnerFeeTerm.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Fee term not found');
  const row = await prisma.partnerFeeTerm.update({
    where: { id },
    data: {
      ...(dto.rateBasisPoints !== undefined ? { rateBasisPoints: dto.rateBasisPoints } : {}),
      ...(dto.fixedAmount !== undefined ? { fixedAmount: dto.fixedAmount } : {}),
      ...(dto.effectiveTo !== undefined ? { effectiveTo: new Date(dto.effectiveTo) } : {}),
      ...(dto.active !== undefined ? { active: dto.active } : {}),
    },
  });
  await recordAuditEvent(auditCtx, { eventType: 'SETTLEMENT', action: 'FEE_TERM_UPDATED', resourceType: 'PartnerFeeTerm', resourceId: id, metadata: { fields: Object.keys(dto) } });
  return row;
}

export async function removeFeeTerm(id: string, auditCtx: AuditContext) {
  const existing = await prisma.partnerFeeTerm.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Fee term not found');
  await prisma.partnerFeeTerm.delete({ where: { id } });
  await recordAuditEvent(auditCtx, { eventType: 'SETTLEMENT', action: 'FEE_TERM_DELETED', resourceType: 'PartnerFeeTerm', resourceId: id, metadata: { partnerKind: existing.partnerKind, partnerId: existing.partnerId } });
}

// Lets the admin fee-term form offer a name-based picker instead of asking
// for a raw partnerId — same four partner kinds computeCommission() already
// branches on, scoped to APPROVED so a draft/rejected application never
// gets a commercial term configured against it.
export async function listPartnerOptions() {
  const [doctors, labs, pharmacies, centres] = await Promise.all([
    prisma.doctorProfile.findMany({ where: { verificationStatus: 'APPROVED' }, select: { id: true, firstName: true, lastName: true }, orderBy: { firstName: 'asc' } }),
    prisma.diagnosticLab.findMany({ where: { verificationStatus: 'APPROVED' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.pharmacy.findMany({ where: { verificationStatus: 'APPROVED' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
    prisma.panchakarmaCentre.findMany({ where: { verificationStatus: 'APPROVED' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }),
  ]);
  return {
    DOCTOR: doctors.map((d) => ({ id: d.id, name: `${d.firstName} ${d.lastName}` })),
    DIAGNOSTIC_LAB: labs.map((l) => ({ id: l.id, name: l.name ?? l.id })),
    PHARMACY: pharmacies.map((p) => ({ id: p.id, name: p.name ?? p.id })),
    PANCHAKARMA_CENTRE: centres.map((c) => ({ id: c.id, name: c.name ?? c.id })),
  };
}
