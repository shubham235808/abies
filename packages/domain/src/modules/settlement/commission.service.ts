import { Prisma, type PartnerKind } from '@prisma/client';
import { prisma } from '../../lib/db';

// EXPANSION-2 — called from the four existing completion hooks
// (completeConsultation, releaseReport, markDelivered, markSessionAttended)
// once their source Payment has actually succeeded. Deliberately NOT
// inside those functions' own prisma.$transaction — same "don't couple an
// unrelated side-effect into the core business transaction" precedent as
// notify()/recordAuditEvent() already being called outside those
// transactions elsewhere in this codebase, and matches the domain-model
// doc's "zero interaction with existing tables besides read-only
// references to Payment".
//
// Idempotent (master prompt §14: "all financial webhooks/actions must be
// idempotent") via Commission.sourcePaymentId's unique constraint — a
// second call for the same payment (e.g. a retried request) returns the
// already-computed row instead of double-counting revenue.
export async function computeCommission(params: { partnerKind: PartnerKind; partnerId: string; paymentId: string }) {
  const existing = await prisma.commission.findUnique({ where: { sourcePaymentId: params.paymentId } });
  if (existing) return existing;

  const payment = await prisma.payment.findUnique({ where: { id: params.paymentId } });
  // A commission only makes sense once money has actually moved — if the
  // payment somehow isn't SUCCESS yet (shouldn't happen: every completion
  // hook this is called from already requires a successful payment to
  // reach that state), there's nothing to compute, and silently returning
  // null here is correct, not an error — this function is best-effort
  // revenue bookkeeping, not a gate on the underlying business action.
  if (!payment || payment.status !== 'SUCCESS') return null;

  const grossAmount = payment.amount;
  const now = new Date();
  const feeTerm = await prisma.partnerFeeTerm.findFirst({
    where: {
      partnerKind: params.partnerKind,
      partnerId: params.partnerId,
      active: true,
      effectiveFrom: { lte: now },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: now } }],
    },
    orderBy: { effectiveFrom: 'desc' },
  });

  // No configured term is a real, visible state (feeTermId: null on the
  // row), not a fabricated default rate — an admin without a fee term set
  // up yet gets a 100%-payable commission they can see and correct, never
  // an invented percentage standing in for a real business decision.
  const feeAmount = !feeTerm
    ? 0
    : feeTerm.feeModel === 'PERCENTAGE'
      ? Math.round((grossAmount * (feeTerm.rateBasisPoints ?? 0)) / 10000)
      : Math.min(feeTerm.fixedAmount ?? 0, grossAmount); // a fixed fee can never exceed the gross it's taken from

  try {
    return await prisma.commission.create({
      data: {
        partnerKind: params.partnerKind,
        partnerId: params.partnerId,
        sourcePaymentId: params.paymentId,
        grossAmount,
        feeAmount,
        payableAmount: grossAmount - feeAmount,
        feeTermId: feeTerm?.id,
      },
    });
  } catch (error) {
    // A concurrent call for the same payment lost the create race —
    // the unique constraint is the actual idempotency guard; this just
    // returns what it wrote instead of surfacing a spurious failure.
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return prisma.commission.findUniqueOrThrow({ where: { sourcePaymentId: params.paymentId } });
    }
    throw error;
  }
}
