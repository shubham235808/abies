// @vitest-environment node
import { randomInt } from 'crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { requestOtp, verifyOtp } from '@/modules/auth/auth.service';

const razorpayMock = vi.hoisted(() => ({
  isConfigured: vi.fn(() => true),
  createOrder: vi.fn(async (params: { amountRupees: number }) => ({
    id: `order_${Math.random().toString(36).slice(2)}`,
    amount: params.amountRupees * 100,
    currency: 'INR',
  })),
  verifySignature: vi.fn(() => true),
  verifyWebhookSignature: vi.fn(() => false),
}));
vi.mock('@/lib/payments/razorpay', () => razorpayMock);

import { getDashboardMetrics } from '@/modules/admin/dashboard.service';
import { approve as approvePharmacy } from '@/modules/medicines/admin-pharmacies.service';
import { addInventory } from '@/modules/medicines/catalogue.service';
import { bookOrder, verifyOrderPayment } from '@/modules/medicines/orders.service';
import { ensurePharmacyProfile, submitPharmacy, updateMyPharmacy } from '@/modules/medicines/pharmacies.service';

function freshMobile(): string {
  return `9${randomInt(100000000, 999999999)}`;
}

const createdUserIds: string[] = [];

async function registerUser(role: 'PATIENT' | 'ADMIN' | 'PHARMACY') {
  const mobile = freshMobile();
  if (role === 'ADMIN') await prisma.user.create({ data: { mobile: `+91${mobile}`, role: 'ADMIN' } });
  const { requestId } = await requestOtp(mobile, role);
  const { session } = await verifyOtp(requestId, '123456', true, {});
  createdUserIds.push(session.userId);
  return session.userId;
}

afterAll(async () => {
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  await prisma.$disconnect();
});

beforeEach(() => {
  razorpayMock.isConfigured.mockReturnValue(true);
  razorpayMock.verifySignature.mockReturnValue(true);
});

describe('admin dashboard revenue metrics (EXPANSION-1d)', () => {
  it('returns a zero-filled 30-day trend and a purpose breakdown, both reflecting a new successful payment', async () => {
    const before = await getDashboardMetrics();
    expect(before.revenueTrend).toHaveLength(30);
    for (const point of before.revenueTrend) {
      expect(point.date).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(typeof point.amount).toBe('number');
    }
    const todayKey = new Date().toISOString().slice(0, 10);
    expect(before.revenueTrend.at(-1)?.date).toBe(todayKey);

    const patientId = await registerUser('PATIENT');
    const pharmacyUserId = await registerUser('PHARMACY');
    await updateMyPharmacy(
      pharmacyUserId,
      { name: 'Dashboard Test Pharmacy', licenseNumbers: [`LIC-${randomInt(100000, 999999)}`], serviceAreas: ['Pune'] },
      { userId: pharmacyUserId },
    );
    await submitPharmacy(pharmacyUserId, true, { userId: pharmacyUserId });
    const adminId = await registerUser('ADMIN');
    const pharmacy = await ensurePharmacyProfile(pharmacyUserId);
    await approvePharmacy(pharmacy.id, { userId: adminId });

    const item = await addInventory(pharmacyUserId, {
      name: `DashboardMetric-${randomInt(1000, 9999)}`,
      requiresPrescription: false,
      batchNumber: `B${randomInt(1000, 9999)}`,
      expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      quantityAvailable: 10,
      price: 77,
    });
    const { order, razorpayOrder } = await bookOrder(patientId, {
      pharmacyId: pharmacy.id,
      deliveryAddress: 'Somewhere',
      items: [{ medicineId: item.medicineId, quantity: 1 }],
    });
    await verifyOrderPayment(
      patientId,
      { orderId: order.id, razorpayOrderId: razorpayOrder.id, razorpayPaymentId: `pay_${randomInt(1000, 9999)}`, razorpaySignature: 'sig' },
      { userId: patientId },
    );

    // These are global, system-wide aggregates (that's the point of an
    // admin dashboard) — other integration test files create and pay for
    // their own orders/appointments concurrently under vitest's parallel
    // workers, all against this same shared dev database. An exact-delta
    // assertion would be a race: this file's own 77 is guaranteed to be
    // included, but the totals can legitimately move by more than that
    // between the "before" and "after" snapshots, so "at least" is the
    // correct (and still meaningful) check here, not "exactly".
    const after = await getDashboardMetrics();
    expect(after.totalRevenue).toBeGreaterThanOrEqual(before.totalRevenue + 77);
    expect((after.revenueByPurpose.MEDICINE_ORDER ?? 0) - (before.revenueByPurpose.MEDICINE_ORDER ?? 0)).toBeGreaterThanOrEqual(77);
    expect(after.revenueTrend.at(-1)!.amount - before.revenueTrend.at(-1)!.amount).toBeGreaterThanOrEqual(77);
  });
});
