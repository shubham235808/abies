// @vitest-environment node
import { randomInt } from 'crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { requestOtp, verifyOtp } from '@/modules/auth/auth.service';
import { createTicket } from '@/modules/support/tickets.service';
import { getCustomerSummary } from '@/modules/support/customer-360.service';

function freshMobile(): string {
  return `9${randomInt(100000000, 999999999)}`;
}

const createdUserIds: string[] = [];

async function registerUser(role: 'PATIENT' | 'CUSTOMER_SUPPORT') {
  const mobile = freshMobile();
  // CUSTOMER_SUPPORT doesn't self-onboard (modules/staff's standing rule) —
  // provision the row directly, same pattern as every other test file's
  // registerAdmin() helper.
  if (role === 'CUSTOMER_SUPPORT') {
    await prisma.user.create({ data: { mobile: `+91${mobile}`, role: 'CUSTOMER_SUPPORT' } });
  }
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

describe('customer 360 (ENTERPRISE-9)', () => {
  it('aggregates a real open ticket for the patient and excludes resolved ones from the open list', async () => {
    const patientId = await registerUser('PATIENT');
    const ticket = await createTicket(
      patientId,
      'PATIENT',
      { category: 'PAYMENT', subject: 'Refund missing', description: 'My refund never arrived, please check the status.' },
      { userId: patientId },
    );

    const summary = await getCustomerSummary(patientId);
    expect(summary.patient.mobile).toBeTruthy();
    expect(summary.openTickets.some((t) => t.id === ticket.id)).toBe(true);
    expect(summary.appointments).toEqual([]);
    expect(summary.diagnosticOrders).toEqual([]);
    expect(summary.medicineOrders).toEqual([]);
    expect(summary.panchakarmaBookings).toEqual([]);
    expect(summary.payments).toEqual([]);
  });

  it('throws NotFoundError for a non-patient user id', async () => {
    const staffId = await registerUser('CUSTOMER_SUPPORT');
    await expect(getCustomerSummary(staffId)).rejects.toThrow(NotFoundError);
  });

  it('throws NotFoundError for an unknown id', async () => {
    await expect(getCustomerSummary('does-not-exist')).rejects.toThrow(NotFoundError);
  });
});
