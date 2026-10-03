// @vitest-environment node
import { randomInt } from 'crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@abies/domain/lib/db';
import { BadRequestError, ConflictError, NotFoundError } from '@abies/domain/lib/errors';

const razorpayMock = vi.hoisted(() => ({
  isConfigured: vi.fn(() => false),
  createOrder: vi.fn(),
  verifySignature: vi.fn(),
  verifyWebhookSignature: vi.fn(),
  refundPayment: vi.fn(async (params: { amountRupees: number }) => ({
    id: `rfnd_${Math.random().toString(36).slice(2)}`,
    amount: params.amountRupees * 100,
    status: 'processed',
  })),
}));
vi.mock('@abies/domain/lib/payments/razorpay', () => razorpayMock);

import { approveRefund, listRefundablePayments, rejectRefund, requestRefund } from '@abies/domain/modules/payments/refunds.service';
import { listAuditEvents, listDistinctEventTypes } from '@abies/domain/modules/audit/audit.service';

function freshMobile(): string {
  return `+919${randomInt(100000000, 999999999)}`;
}

const createdUserIds: string[] = [];

async function createUser(role: 'PATIENT' | 'ADMIN' | 'CUSTOMER_SUPPORT') {
  const user = await prisma.user.create({ data: { mobile: freshMobile(), role } });
  createdUserIds.push(user.id);
  return user.id;
}

async function successPayment(payerUserId: string, amount: number) {
  return prisma.payment.create({
    data: {
      payerUserId,
      purpose: 'CONSULTATION',
      purposeEntityId: 'test-fixture',
      amount,
      status: 'SUCCESS',
      gatewayOrderId: `order_${randomInt(1_000_000, 9_999_999)}`,
      gatewayPaymentId: `pay_${randomInt(1_000_000, 9_999_999)}`,
      verifiedAt: new Date(),
    },
  });
}

afterAll(async () => {
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

beforeEach(() => {
  razorpayMock.isConfigured.mockReturnValue(false);
  razorpayMock.refundPayment.mockClear();
});

describe('requesting a refund', () => {
  it('refuses a payment that never succeeded', async () => {
    const patientId = await createUser('PATIENT');
    const agentId = await createUser('CUSTOMER_SUPPORT');
    const payment = await prisma.payment.create({
      data: { payerUserId: patientId, purpose: 'CONSULTATION', purposeEntityId: 'x', amount: 500, status: 'CREATED' },
    });

    await expect(requestRefund(agentId, { paymentId: payment.id, amount: 500 }, { userId: agentId })).rejects.toThrow(ConflictError);
  });

  it('refuses an amount beyond the refundable balance', async () => {
    const patientId = await createUser('PATIENT');
    const agentId = await createUser('CUSTOMER_SUPPORT');
    const payment = await successPayment(patientId, 500);

    await expect(requestRefund(agentId, { paymentId: payment.id, amount: 600 }, { userId: agentId })).rejects.toThrow(BadRequestError);
  });

  it('refuses a second request once the balance is already committed', async () => {
    const patientId = await createUser('PATIENT');
    const agentId = await createUser('CUSTOMER_SUPPORT');
    const payment = await successPayment(patientId, 500);

    await requestRefund(agentId, { paymentId: payment.id, amount: 500 }, { userId: agentId });
    await expect(requestRefund(agentId, { paymentId: payment.id, amount: 1 }, { userId: agentId })).rejects.toThrow(BadRequestError);
  });

  it('surfaces the payment in the patient\'s refundable-payments list', async () => {
    const patientId = await createUser('PATIENT');
    const payment = await successPayment(patientId, 750);

    const payments = await listRefundablePayments(patientId);
    expect(payments.some((p) => p.id === payment.id)).toBe(true);
  });
});

describe('deciding a refund', () => {
  it('leaves an approved refund at PROCESSING when the gateway is not configured, and payment status untouched', async () => {
    const patientId = await createUser('PATIENT');
    const agentId = await createUser('CUSTOMER_SUPPORT');
    const adminId = await createUser('ADMIN');
    const payment = await successPayment(patientId, 500);
    const refund = await requestRefund(agentId, { paymentId: payment.id, amount: 500 }, { userId: agentId });

    const approved = await approveRefund(adminId, refund.id, { userId: adminId });
    expect(approved.status).toBe('PROCESSING');
    expect(approved.approvedByUserId).toBe(adminId);
    expect(razorpayMock.refundPayment).not.toHaveBeenCalled();

    const untouchedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(untouchedPayment.status).toBe('SUCCESS');
  });

  it('completes the refund and marks the payment REFUNDED when the full amount is refunded via a configured gateway', async () => {
    razorpayMock.isConfigured.mockReturnValue(true);
    const patientId = await createUser('PATIENT');
    const agentId = await createUser('CUSTOMER_SUPPORT');
    const adminId = await createUser('ADMIN');
    const payment = await successPayment(patientId, 500);
    const refund = await requestRefund(agentId, { paymentId: payment.id, amount: 500 }, { userId: agentId });

    const approved = await approveRefund(adminId, refund.id, { userId: adminId });
    expect(approved.status).toBe('COMPLETED');
    expect(approved.gatewayRefundRef).toBeTruthy();

    const updatedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updatedPayment.status).toBe('REFUNDED');
  });

  it('marks the payment PARTIALLY_REFUNDED when less than the full amount is refunded', async () => {
    razorpayMock.isConfigured.mockReturnValue(true);
    const patientId = await createUser('PATIENT');
    const agentId = await createUser('CUSTOMER_SUPPORT');
    const adminId = await createUser('ADMIN');
    const payment = await successPayment(patientId, 500);
    const refund = await requestRefund(agentId, { paymentId: payment.id, amount: 200 }, { userId: agentId });

    await approveRefund(adminId, refund.id, { userId: adminId });
    const updatedPayment = await prisma.payment.findUniqueOrThrow({ where: { id: payment.id } });
    expect(updatedPayment.status).toBe('PARTIALLY_REFUNDED');
  });

  it('refuses approving or rejecting a refund that has already been decided', async () => {
    const patientId = await createUser('PATIENT');
    const agentId = await createUser('CUSTOMER_SUPPORT');
    const adminId = await createUser('ADMIN');
    const payment = await successPayment(patientId, 500);
    const refund = await requestRefund(agentId, { paymentId: payment.id, amount: 500 }, { userId: agentId });

    await rejectRefund(adminId, refund.id, {}, { userId: adminId });
    await expect(approveRefund(adminId, refund.id, { userId: adminId })).rejects.toThrow(ConflictError);
  });

  it('throws NotFoundError for an unknown refund id', async () => {
    const adminId = await createUser('ADMIN');
    await expect(approveRefund(adminId, 'does-not-exist', { userId: adminId })).rejects.toThrow(NotFoundError);
  });
});

describe('audit log read side', () => {
  it('records a REFUND audit event for a request and makes it discoverable by filter', async () => {
    const patientId = await createUser('PATIENT');
    const agentId = await createUser('CUSTOMER_SUPPORT');
    const payment = await successPayment(patientId, 300);
    const refund = await requestRefund(agentId, { paymentId: payment.id, amount: 300 }, { userId: agentId });

    const eventTypes = await listDistinctEventTypes();
    expect(eventTypes).toContain('REFUND');

    const { events, total } = await listAuditEvents({ eventType: 'REFUND', resourceType: 'Refund' });
    expect(total).toBeGreaterThan(0);
    expect(events.some((e) => e.resourceId === refund.id && e.action === 'REQUESTED')).toBe(true);
  });
});
