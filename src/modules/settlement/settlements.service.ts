import { prisma } from '@/lib/db';
import { BadRequestError, ConflictError, NotFoundError } from '@/lib/errors';
import { recordAuditEvent } from '@/server/audit';
import type { AuditContext } from '@/server/audit';
import type { createSettlementSchema, markPayoutFailedSchema, markPayoutPaidSchema, recordReconciliationSchema } from './settlement.schemas';
import type { z } from 'zod';

export async function listSettlements() {
  return prisma.settlement.findMany({
    include: { payouts: { select: { id: true, status: true, totalAmount: true } } },
    orderBy: { cycleStart: 'desc' },
  });
}

export async function getSettlement(id: string) {
  const settlement = await prisma.settlement.findUnique({
    where: { id },
    include: { payouts: { include: { reconciliation: true, _count: { select: { commissions: true } } }, orderBy: { partnerKind: 'asc' } } },
  });
  if (!settlement) throw new NotFoundError('Settlement cycle not found');
  return settlement;
}

export async function createSettlement(dto: z.infer<typeof createSettlementSchema>, auditCtx: AuditContext) {
  const cycleStart = new Date(dto.cycleStart);
  const cycleEnd = new Date(dto.cycleEnd);
  if (cycleEnd <= cycleStart) throw new BadRequestError('cycleEnd must be after cycleStart');
  const settlement = await prisma.settlement.create({ data: { cycleStart, cycleEnd } });
  await recordAuditEvent(auditCtx, { eventType: 'SETTLEMENT', action: 'CYCLE_CREATED', resourceType: 'Settlement', resourceId: settlement.id });
  return settlement;
}

export async function lockSettlement(id: string, auditCtx: AuditContext) {
  const settlement = await prisma.settlement.findUnique({ where: { id } });
  if (!settlement) throw new NotFoundError('Settlement cycle not found');
  if (settlement.status !== 'OPEN') throw new ConflictError('Only an open cycle can be locked');
  const updated = await prisma.settlement.update({ where: { id }, data: { status: 'LOCKED', lockedAt: new Date() } });
  await recordAuditEvent(auditCtx, { eventType: 'SETTLEMENT', action: 'CYCLE_LOCKED', resourceType: 'Settlement', resourceId: id });
  return updated;
}

// Aggregates every PENDING commission recorded within the cycle window into
// one Payout per partner — grouped in application code (not a Prisma
// groupBy) because each included Commission row also needs its own
// status/payoutId update, which groupBy's aggregate result can't drive.
export async function generatePayouts(settlementId: string, auditCtx: AuditContext) {
  const settlement = await prisma.settlement.findUnique({ where: { id: settlementId } });
  if (!settlement) throw new NotFoundError('Settlement cycle not found');
  if (settlement.status !== 'LOCKED') throw new ConflictError('Lock the cycle before generating payouts');

  const commissions = await prisma.commission.findMany({
    where: { status: 'PENDING', createdAt: { gte: settlement.cycleStart, lte: settlement.cycleEnd } },
  });
  if (commissions.length === 0) return [];

  const byPartner = new Map<string, { partnerKind: typeof commissions[number]['partnerKind']; partnerId: string; total: number; commissionIds: string[] }>();
  for (const c of commissions) {
    const key = `${c.partnerKind}:${c.partnerId}`;
    const group = byPartner.get(key) ?? { partnerKind: c.partnerKind, partnerId: c.partnerId, total: 0, commissionIds: [] };
    group.total += c.payableAmount;
    group.commissionIds.push(c.id);
    byPartner.set(key, group);
  }

  const payouts = await prisma.$transaction(
    Array.from(byPartner.values()).map((group) =>
      prisma.payout.create({
        data: {
          settlementId,
          partnerKind: group.partnerKind,
          partnerId: group.partnerId,
          totalAmount: group.total,
        },
      }),
    ),
  );

  await prisma.$transaction(
    payouts.map((payout, i) => {
      const group = Array.from(byPartner.values())[i]!;
      return prisma.commission.updateMany({
        where: { id: { in: group.commissionIds } },
        data: { status: 'INCLUDED', payoutId: payout.id },
      });
    }),
  );

  await recordAuditEvent(auditCtx, {
    eventType: 'SETTLEMENT',
    action: 'PAYOUTS_GENERATED',
    resourceType: 'Settlement',
    resourceId: settlementId,
    metadata: { payoutCount: payouts.length },
  });
  return payouts;
}

export async function completeSettlement(id: string, auditCtx: AuditContext) {
  const settlement = await prisma.settlement.findUnique({ where: { id }, include: { payouts: { select: { status: true } } } });
  if (!settlement) throw new NotFoundError('Settlement cycle not found');
  if (settlement.status !== 'LOCKED') throw new ConflictError('Only a locked cycle can be completed');
  const unresolved = settlement.payouts.some((p) => p.status === 'PENDING' || p.status === 'PROCESSING');
  if (unresolved) throw new ConflictError('Every payout must be marked paid or failed before completing the cycle');
  const updated = await prisma.settlement.update({ where: { id }, data: { status: 'COMPLETED', completedAt: new Date() } });
  await recordAuditEvent(auditCtx, { eventType: 'SETTLEMENT', action: 'CYCLE_COMPLETED', resourceType: 'Settlement', resourceId: id });
  return updated;
}

export async function markPayoutPaid(payoutId: string, dto: z.infer<typeof markPayoutPaidSchema>, auditCtx: AuditContext) {
  const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new NotFoundError('Payout not found');
  if (payout.status !== 'PENDING' && payout.status !== 'PROCESSING') throw new ConflictError('Only a pending/processing payout can be marked paid');
  const updated = await prisma.payout.update({ where: { id: payoutId }, data: { status: 'PAID', paidAt: new Date(), gatewayPayoutRef: dto.gatewayPayoutRef } });
  await recordAuditEvent(auditCtx, { eventType: 'SETTLEMENT', action: 'PAYOUT_MARKED_PAID', resourceType: 'Payout', resourceId: payoutId, metadata: { gatewayPayoutRef: dto.gatewayPayoutRef } });
  return updated;
}

export async function markPayoutFailed(payoutId: string, dto: z.infer<typeof markPayoutFailedSchema>, auditCtx: AuditContext) {
  const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new NotFoundError('Payout not found');
  if (payout.status !== 'PENDING' && payout.status !== 'PROCESSING') throw new ConflictError('Only a pending/processing payout can be marked failed');
  const updated = await prisma.payout.update({ where: { id: payoutId }, data: { status: 'FAILED', failureReason: dto.failureReason } });
  await recordAuditEvent(auditCtx, { eventType: 'SETTLEMENT', action: 'PAYOUT_MARKED_FAILED', resourceType: 'Payout', resourceId: payoutId, metadata: { failureReason: dto.failureReason } });
  return updated;
}

export async function listUnreconciledPaidPayouts() {
  return prisma.payout.findMany({
    where: { status: 'PAID', reconciliation: null },
    include: { settlement: { select: { cycleStart: true, cycleEnd: true } } },
    orderBy: { paidAt: 'asc' },
  });
}

export async function listReconciledPayouts() {
  return prisma.payout.findMany({
    where: { status: 'PAID', reconciliation: { isNot: null } },
    include: { reconciliation: true, settlement: { select: { cycleStart: true, cycleEnd: true } } },
    orderBy: { paidAt: 'desc' },
  });
}

export async function recordReconciliation(payoutId: string, dto: z.infer<typeof recordReconciliationSchema>, reconciledByUserId: string, auditCtx: AuditContext) {
  const payout = await prisma.payout.findUnique({ where: { id: payoutId } });
  if (!payout) throw new NotFoundError('Payout not found');
  if (payout.status !== 'PAID') throw new ConflictError('Only a paid payout can be reconciled');
  const matched = dto.matchedAmount === payout.totalAmount;
  const row = await prisma.reconciliation.upsert({
    where: { payoutId },
    create: { payoutId, externalReference: dto.externalReference, matchedAmount: dto.matchedAmount, matched, notes: dto.notes, reconciledByUserId, reconciledAt: new Date() },
    update: { externalReference: dto.externalReference, matchedAmount: dto.matchedAmount, matched, notes: dto.notes, reconciledByUserId, reconciledAt: new Date() },
  });
  await recordAuditEvent(auditCtx, { eventType: 'SETTLEMENT', action: 'PAYOUT_RECONCILED', resourceType: 'Payout', resourceId: payoutId, metadata: { matched } });
  return row;
}
