import type { RefundStatus } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '../../lib/db';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors';
import { isConfigured, refundPayment } from '../../lib/payments/razorpay';
import { logger } from '../../lib/logger';
import { notify } from '../notifications/notifications.service';
import { recordAuditEvent, type AuditContext } from '../../server/audit';
import type { rejectRefundSchema, requestRefundSchema } from './refunds.schemas';

type RequestRefundInput = z.infer<typeof requestRefundSchema>;
type RejectRefundInput = z.infer<typeof rejectRefundSchema>;

// Amounts already spoken for by a not-yet-rejected refund on this payment —
// REQUESTED/APPROVED/PROCESSING all count, not just COMPLETED, so two agents
// can't both request the same money before either is decided.
const OPEN_REFUND_STATUSES: RefundStatus[] = ['REQUESTED', 'APPROVED', 'PROCESSING', 'COMPLETED'];

async function refundableBalance(paymentId: string, amount: number): Promise<number> {
  const committed = await prisma.refund.aggregate({
    where: { paymentId, status: { in: OPEN_REFUND_STATUSES } },
    _sum: { amount: true },
  });
  return amount - (committed._sum?.amount ?? 0);
}

export async function requestRefund(requestedByUserId: string, dto: RequestRefundInput, auditCtx: AuditContext) {
  const payment = await prisma.payment.findUnique({ where: { id: dto.paymentId } });
  if (!payment) throw new NotFoundError('Payment not found');
  if (payment.status !== 'SUCCESS' && payment.status !== 'PARTIALLY_REFUNDED') {
    throw new ConflictError('Only a successful payment can be refunded');
  }

  const remaining = await refundableBalance(payment.id, payment.amount);
  if (dto.amount > remaining) {
    throw new BadRequestError(`Amount exceeds the refundable balance (₹${remaining} remaining)`);
  }

  const refund = await prisma.refund.create({
    data: { paymentId: payment.id, amount: dto.amount, reason: dto.reason, requestedByUserId },
  });

  await recordAuditEvent(auditCtx, {
    eventType: 'REFUND',
    action: 'REQUESTED',
    resourceType: 'Refund',
    resourceId: refund.id,
    metadata: { paymentId: payment.id, amount: dto.amount },
  });

  return refund;
}

export async function listQueue(status: 'REQUESTED' | 'APPROVED' | 'PROCESSING' | 'COMPLETED' | 'REJECTED' = 'REQUESTED') {
  return prisma.refund.findMany({
    where: { status },
    include: {
      payment: { select: { id: true, amount: true, purpose: true, payerUserId: true } },
      requestedBy: { select: { mobile: true, role: true } },
      approvedBy: { select: { mobile: true } },
    },
    orderBy: { createdAt: 'asc' },
  });
}

export async function approveRefund(adminUserId: string, refundId: string, auditCtx: AuditContext) {
  const refund = await prisma.refund.findUnique({ where: { id: refundId }, include: { payment: true } });
  if (!refund) throw new NotFoundError('Refund not found');
  if (refund.status !== 'REQUESTED') throw new ConflictError('This refund has already been decided');

  let updated = await prisma.refund.update({
    where: { id: refundId },
    data: { status: 'PROCESSING', approvedByUserId: adminUserId },
  });

  await recordAuditEvent(auditCtx, {
    eventType: 'REFUND',
    action: 'APPROVED',
    resourceType: 'Refund',
    resourceId: refundId,
    metadata: { paymentId: refund.paymentId, amount: refund.amount },
  });

  // Same honest-gap pattern as every checkout path in this codebase: without
  // real Razorpay credentials there's nothing this can do beyond recording
  // the admin's decision — the refund sits at PROCESSING until a real
  // gateway is configured, rather than fake a completed refund.
  if (isConfigured() && refund.payment.gatewayPaymentId) {
    try {
      const gatewayRefund = await refundPayment({
        gatewayPaymentId: refund.payment.gatewayPaymentId,
        amountRupees: refund.amount,
        notes: { refundId: refund.id },
      });
      const remaining = await refundableBalance(refund.payment.id, refund.payment.amount);
      updated = await prisma.$transaction(async (tx) => {
        const completed = await tx.refund.update({
          where: { id: refundId },
          data: { status: 'COMPLETED', gatewayRefundRef: gatewayRefund.id },
        });
        await tx.payment.update({
          where: { id: refund.payment.id },
          data: { status: remaining <= 0 ? 'REFUNDED' : 'PARTIALLY_REFUNDED' },
        });
        return completed;
      });
      await recordAuditEvent(auditCtx, {
        eventType: 'REFUND',
        action: 'COMPLETED',
        resourceType: 'Refund',
        resourceId: refundId,
        metadata: { gatewayRefundRef: gatewayRefund.id },
      });
    } catch (err) {
      logger.error('refunds', 'gateway refund failed, leaving refund at PROCESSING', err, { refundId });
    }
  }

  await notify(refund.payment.payerUserId, 'IN_APP', 'refund.approved', { refundId, amount: refund.amount });
  return updated;
}

export async function rejectRefund(adminUserId: string, refundId: string, dto: RejectRefundInput, auditCtx: AuditContext) {
  const refund = await prisma.refund.findUnique({ where: { id: refundId }, include: { payment: true } });
  if (!refund) throw new NotFoundError('Refund not found');
  if (refund.status !== 'REQUESTED') throw new ConflictError('This refund has already been decided');

  const updated = await prisma.refund.update({
    where: { id: refundId },
    data: { status: 'REJECTED', approvedByUserId: adminUserId },
  });

  await recordAuditEvent(auditCtx, {
    eventType: 'REFUND',
    action: 'REJECTED',
    resourceType: 'Refund',
    resourceId: refundId,
    metadata: { reason: dto.reason },
  });
  await notify(refund.payment.payerUserId, 'IN_APP', 'refund.rejected', { refundId });

  return updated;
}

// Surfaced in a support ticket's staff view (src/components/support/ticket-thread.tsx)
// so an agent can pick the right payment to refund without a separate
// payments-search screen — every payment a patient has made is already
// reachable from the ticket they opened about it.
export async function listRefundablePayments(patientUserId: string) {
  const payments = await prisma.payment.findMany({
    where: { payerUserId: patientUserId, status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED'] } },
    include: { refunds: { select: { id: true, amount: true, status: true } } },
    orderBy: { createdAt: 'desc' },
    take: 10,
  });
  return payments.map((p) => ({
    id: p.id,
    purpose: p.purpose,
    amount: p.amount,
    status: p.status,
    createdAt: p.createdAt,
    refunds: p.refunds,
  }));
}
