import type { PartnerKind } from '@prisma/client';
import { prisma } from '../../lib/db';

// Read-only partner-facing view over their own Commission/Payout rows —
// no new query shape, just scoped by (partnerKind, partnerId) the same way
// every other "mine" list in this codebase scopes by the caller's own id.
export async function earningsSummary(partnerKind: PartnerKind, partnerId: string) {
  const [pending, included, paidPayouts] = await Promise.all([
    prisma.commission.aggregate({ where: { partnerKind, partnerId, status: 'PENDING' }, _sum: { payableAmount: true }, _count: true }),
    // A commission permanently stays 'INCLUDED' once swept into a payout —
    // that status alone doesn't say whether the payout itself has since
    // been paid, so "awaiting payout" has to also exclude one whose payout
    // already resolved (paid or failed), not just filter on Commission.status.
    prisma.commission.aggregate({
      where: { partnerKind, partnerId, status: 'INCLUDED', payout: { status: { in: ['PENDING', 'PROCESSING'] } } },
      _sum: { payableAmount: true },
      _count: true,
    }),
    prisma.payout.aggregate({ where: { partnerKind, partnerId, status: 'PAID' }, _sum: { totalAmount: true }, _count: true }),
  ]);
  return {
    pendingAmount: pending._sum.payableAmount ?? 0,
    pendingCount: pending._count,
    awaitingPayoutAmount: included._sum.payableAmount ?? 0,
    awaitingPayoutCount: included._count,
    lifetimePaidAmount: paidPayouts._sum.totalAmount ?? 0,
    paidPayoutCount: paidPayouts._count,
  };
}

export async function listMyCommissions(partnerKind: PartnerKind, partnerId: string) {
  return prisma.commission.findMany({ where: { partnerKind, partnerId }, orderBy: { createdAt: 'desc' }, take: 50 });
}

export async function listMyPayouts(partnerKind: PartnerKind, partnerId: string) {
  return prisma.payout.findMany({
    where: { partnerKind, partnerId },
    include: { settlement: { select: { cycleStart: true, cycleEnd: true } } },
    orderBy: { createdAt: 'desc' },
    take: 50,
  });
}
