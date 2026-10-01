// @vitest-environment node
import { randomInt } from 'crypto';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { BadRequestError, ConflictError } from '@/lib/errors';
import { computeCommission } from '@/modules/settlement/commission.service';
import { createFeeTerm, listPartnerOptions } from '@/modules/settlement/fee-terms.service';
import {
  completeSettlement,
  createSettlement,
  generatePayouts,
  lockSettlement,
  markPayoutFailed,
  markPayoutPaid,
  recordReconciliation,
} from '@/modules/settlement/settlements.service';

const createdUserIds: string[] = [];
const createdFeeTermIds: string[] = [];
const createdSettlementIds: string[] = [];
let adminUserId: string;
let AUDIT_CTX: { userId: string };

beforeAll(async () => {
  const mobile = `9${randomInt(100000000, 999999999)}`;
  const admin = await prisma.user.create({ data: { mobile: `+91${mobile}`, role: 'ADMIN' } });
  createdUserIds.push(admin.id);
  adminUserId = admin.id;
  AUDIT_CTX = { userId: adminUserId };
});

async function freshPayerId() {
  const mobile = `9${randomInt(100000000, 999999999)}`;
  const user = await prisma.user.create({ data: { mobile: `+91${mobile}`, role: 'PATIENT' } });
  createdUserIds.push(user.id);
  return user.id;
}

async function successPayment(amount: number, purpose: 'CONSULTATION' | 'DIAGNOSTIC_ORDER' | 'MEDICINE_ORDER' | 'PANCHAKARMA_BOOKING' = 'CONSULTATION') {
  const payerUserId = await freshPayerId();
  return prisma.payment.create({
    data: {
      payerUserId,
      purpose,
      purposeEntityId: `test-${randomInt(100000, 999999)}`,
      amount,
      status: 'SUCCESS',
      gatewayOrderId: `order_test_${randomInt(1000000, 9999999)}`,
      gatewayPaymentId: `pay_test_${randomInt(1000000, 9999999)}`,
      gatewaySignature: 'test-fixture',
      verifiedAt: new Date(),
    },
  });
}

afterAll(async () => {
  await prisma.settlement.deleteMany({ where: { id: { in: createdSettlementIds } } }); // cascades its payouts
  await prisma.partnerFeeTerm.deleteMany({ where: { id: { in: createdFeeTermIds } } });
  if (createdUserIds.length) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }); // cascades payments -> commissions
  await prisma.$disconnect();
});

describe('computeCommission (EXPANSION-2)', () => {
  it('records a 0%-fee commission when no fee term is configured, never a fabricated default rate', async () => {
    const partnerId = `partner-${randomInt(100000, 999999)}`;
    const payment = await successPayment(1000);
    const commission = await computeCommission({ partnerKind: 'DOCTOR', partnerId, paymentId: payment.id });
    expect(commission).toMatchObject({ grossAmount: 1000, feeAmount: 0, payableAmount: 1000, feeTermId: null, status: 'PENDING' });
  });

  it('computes a percentage fee correctly and rounds to the nearest rupee', async () => {
    const partnerId = `partner-${randomInt(100000, 999999)}`;
    const feeTerm = await createFeeTerm(
      { partnerKind: 'DIAGNOSTIC_LAB', partnerId, feeModel: 'PERCENTAGE', rateBasisPoints: 1250, effectiveFrom: new Date(Date.now() - 86_400_000).toISOString() },
      adminUserId,
      AUDIT_CTX,
    );
    createdFeeTermIds.push(feeTerm.id);
    const payment = await successPayment(777, 'DIAGNOSTIC_ORDER');
    const commission = await computeCommission({ partnerKind: 'DIAGNOSTIC_LAB', partnerId, paymentId: payment.id });
    // 777 * 12.5% = 97.125 -> rounds to 97
    expect(commission).toMatchObject({ grossAmount: 777, feeAmount: 97, payableAmount: 680, feeTermId: feeTerm.id });
  });

  it('caps a fixed fee at the gross amount so the platform never takes more than the payment itself', async () => {
    const partnerId = `partner-${randomInt(100000, 999999)}`;
    const feeTerm = await createFeeTerm(
      { partnerKind: 'PHARMACY', partnerId, feeModel: 'FIXED', fixedAmount: 500, effectiveFrom: new Date(Date.now() - 86_400_000).toISOString() },
      adminUserId,
      AUDIT_CTX,
    );
    createdFeeTermIds.push(feeTerm.id);
    const payment = await successPayment(300, 'MEDICINE_ORDER');
    const commission = await computeCommission({ partnerKind: 'PHARMACY', partnerId, paymentId: payment.id });
    expect(commission).toMatchObject({ grossAmount: 300, feeAmount: 300, payableAmount: 0 });
  });

  it('is idempotent — a second call for the same payment returns the existing row, never a duplicate', async () => {
    const partnerId = `partner-${randomInt(100000, 999999)}`;
    const payment = await successPayment(500);
    const first = await computeCommission({ partnerKind: 'DOCTOR', partnerId, paymentId: payment.id });
    const second = await computeCommission({ partnerKind: 'DOCTOR', partnerId, paymentId: payment.id });
    expect(second!.id).toBe(first!.id);
    const count = await prisma.commission.count({ where: { sourcePaymentId: payment.id } });
    expect(count).toBe(1);
  });

  it('returns null and creates nothing for a payment that never succeeded', async () => {
    const payerUserId = await freshPayerId();
    const payment = await prisma.payment.create({
      data: { payerUserId, purpose: 'CONSULTATION', purposeEntityId: 'never-paid', amount: 400, status: 'PENDING' },
    });
    const result = await computeCommission({ partnerKind: 'DOCTOR', partnerId: 'any-partner', paymentId: payment.id });
    expect(result).toBeNull();
    const count = await prisma.commission.count({ where: { sourcePaymentId: payment.id } });
    expect(count).toBe(0);
  });

  it('picks the fee term whose effective window actually covers now, ignoring an expired or not-yet-started one', async () => {
    const partnerId = `partner-${randomInt(100000, 999999)}`;
    const expired = await createFeeTerm(
      {
        partnerKind: 'PANCHAKARMA_CENTRE',
        partnerId,
        feeModel: 'PERCENTAGE',
        rateBasisPoints: 2000,
        effectiveFrom: new Date(Date.now() - 30 * 86_400_000).toISOString(),
        effectiveTo: new Date(Date.now() - 86_400_000).toISOString(),
      },
      adminUserId,
      AUDIT_CTX,
    );
    const current = await createFeeTerm(
      { partnerKind: 'PANCHAKARMA_CENTRE', partnerId, feeModel: 'PERCENTAGE', rateBasisPoints: 1000, effectiveFrom: new Date(Date.now() - 86_400_000).toISOString() },
      adminUserId,
      AUDIT_CTX,
    );
    const future = await createFeeTerm(
      { partnerKind: 'PANCHAKARMA_CENTRE', partnerId, feeModel: 'PERCENTAGE', rateBasisPoints: 3000, effectiveFrom: new Date(Date.now() + 30 * 86_400_000).toISOString() },
      adminUserId,
      AUDIT_CTX,
    );
    createdFeeTermIds.push(expired.id, current.id, future.id);

    const payment = await successPayment(1000, 'PANCHAKARMA_BOOKING');
    const commission = await computeCommission({ partnerKind: 'PANCHAKARMA_CENTRE', partnerId, paymentId: payment.id });
    expect(commission!.feeTermId).toBe(current.id);
    expect(commission!.feeAmount).toBe(100); // 10%, not the expired 20% or future 30%
  });
});

describe('fee-terms.service validation', () => {
  it('rejects a percentage term with no rate and a fixed term with no amount', async () => {
    await expect(
      createFeeTerm({ partnerKind: 'DOCTOR', partnerId: 'x', feeModel: 'PERCENTAGE', effectiveFrom: new Date().toISOString() }, adminUserId, AUDIT_CTX),
    ).rejects.toThrow(BadRequestError);
    await expect(
      createFeeTerm({ partnerKind: 'DOCTOR', partnerId: 'x', feeModel: 'FIXED', effectiveFrom: new Date().toISOString() }, adminUserId, AUDIT_CTX),
    ).rejects.toThrow(BadRequestError);
  });

  it('lists only APPROVED partners as options, scoped by kind', async () => {
    const options = await listPartnerOptions();
    expect(options).toHaveProperty('DOCTOR');
    expect(options).toHaveProperty('DIAGNOSTIC_LAB');
    expect(options).toHaveProperty('PHARMACY');
    expect(options).toHaveProperty('PANCHAKARMA_CENTRE');
  });
});

describe('settlement cycle lifecycle (EXPANSION-2)', () => {
  it('aggregates pending commissions into one payout per partner, then walks lock -> generate -> pay -> complete', async () => {
    const partnerId = `partner-${randomInt(100000, 999999)}`;
    // generatePayouts sweeps every PENDING commission in [cycleStart, cycleEnd]
    // by design (a real cycle settles every partner, not just one) — against
    // the shared dev DB that means a wide window could also catch an
    // unrelated commission from another test file running concurrently,
    // which would get stranded (INCLUDED with a payoutId that this test's
    // afterAll then deletes) rather than just fail an assertion. Keeping the
    // window to the few milliseconds it takes to create these two fixture
    // payments — instead of padding it with minutes — shrinks that exposure
    // to effectively nothing without changing generatePayouts' real, correct
    // "aggregate the whole cycle" semantics.
    const cycleStart = new Date();
    const p1 = await successPayment(1000);
    const p2 = await successPayment(500);
    await computeCommission({ partnerKind: 'DOCTOR', partnerId, paymentId: p1.id });
    await computeCommission({ partnerKind: 'DOCTOR', partnerId, paymentId: p2.id });
    const cycleEnd = new Date();

    const settlement = await createSettlement({ cycleStart: cycleStart.toISOString(), cycleEnd: cycleEnd.toISOString() }, AUDIT_CTX);
    createdSettlementIds.push(settlement.id);

    // generatePayouts refuses to run before the cycle is locked.
    await expect(generatePayouts(settlement.id, AUDIT_CTX)).rejects.toThrow(ConflictError);

    await lockSettlement(settlement.id, AUDIT_CTX);
    const payouts = await generatePayouts(settlement.id, AUDIT_CTX);
    const payout = payouts.find((p) => p.partnerId === partnerId)!;
    expect(payout.totalAmount).toBe(1500); // both commissions' payableAmount summed (no fee term -> 100% payable)

    const includedCount = await prisma.commission.count({ where: { partnerId, status: 'INCLUDED', payoutId: payout.id } });
    expect(includedCount).toBe(2);

    // Can't complete while a payout is still pending.
    await expect(completeSettlement(settlement.id, AUDIT_CTX)).rejects.toThrow(ConflictError);

    const paid = await markPayoutPaid(payout.id, { gatewayPayoutRef: 'TEST-REF-1' }, AUDIT_CTX);
    expect(paid.status).toBe('PAID');
    // Mark every other payout this sweep happened to pick up (in the vanishingly
    // unlikely case a concurrent test's commission landed in this same
    // millisecond window) paid too, so completeSettlement's "every payout
    // resolved" check isn't left hanging on something outside this test.
    for (const other of payouts) {
      if (other.id !== payout.id) await markPayoutPaid(other.id, { gatewayPayoutRef: 'TEST-REF-STRAY' }, AUDIT_CTX);
    }

    const completed = await completeSettlement(settlement.id, AUDIT_CTX);
    expect(completed.status).toBe('COMPLETED');
  });

  it('records a reconciliation as matched or mismatched based on the statement amount, and only for a paid payout', async () => {
    const partnerId = `partner-${randomInt(100000, 999999)}`;
    const cycleStart = new Date();
    const payment = await successPayment(2000);
    await computeCommission({ partnerKind: 'PHARMACY', partnerId, paymentId: payment.id });
    const cycleEnd = new Date();

    const settlement = await createSettlement({ cycleStart: cycleStart.toISOString(), cycleEnd: cycleEnd.toISOString() }, AUDIT_CTX);
    createdSettlementIds.push(settlement.id);
    await lockSettlement(settlement.id, AUDIT_CTX);
    const payout = (await generatePayouts(settlement.id, AUDIT_CTX)).find((p) => p.partnerId === partnerId);

    await expect(recordReconciliation(payout!.id, { externalReference: 'STMT-1', matchedAmount: 2000 }, adminUserId, AUDIT_CTX)).rejects.toThrow(ConflictError);

    await markPayoutPaid(payout!.id, { gatewayPayoutRef: 'TEST-REF-2' }, AUDIT_CTX);
    const mismatched = await recordReconciliation(payout!.id, { externalReference: 'STMT-1', matchedAmount: 1999 }, adminUserId, AUDIT_CTX);
    expect(mismatched.matched).toBe(false);

    const matched = await recordReconciliation(payout!.id, { externalReference: 'STMT-1', matchedAmount: 2000 }, adminUserId, AUDIT_CTX);
    expect(matched.matched).toBe(true);
  });

  it('marks a payout failed with a reason instead of paid', async () => {
    const partnerId = `partner-${randomInt(100000, 999999)}`;
    const cycleStart = new Date();
    const payment = await successPayment(900);
    await computeCommission({ partnerKind: 'DIAGNOSTIC_LAB', partnerId, paymentId: payment.id });
    const cycleEnd = new Date();

    const settlement = await createSettlement({ cycleStart: cycleStart.toISOString(), cycleEnd: cycleEnd.toISOString() }, AUDIT_CTX);
    createdSettlementIds.push(settlement.id);
    await lockSettlement(settlement.id, AUDIT_CTX);
    const payout = (await generatePayouts(settlement.id, AUDIT_CTX)).find((p) => p.partnerId === partnerId);

    const failed = await markPayoutFailed(payout!.id, { failureReason: 'Bank account details rejected by gateway' }, AUDIT_CTX);
    expect(failed.status).toBe('FAILED');
    expect(failed.failureReason).toBe('Bank account details rejected by gateway');
  });
});
