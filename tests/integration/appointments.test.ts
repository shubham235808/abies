// @vitest-environment node
import { randomInt } from 'crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { ConflictError, ServiceUnavailableError } from '@/lib/errors';
import { requestOtp, verifyOtp } from '@/modules/auth/auth.service';
import { approve, reviewDocument } from '@/modules/doctors/admin-doctors.service';
import { addAvailability, addDocument, submit, updateMe } from '@/modules/doctors/doctors.service';

// vi.mock calls are hoisted above every import in this file by Vitest's
// transform, so the appointments module resolves this mock regardless of
// where the mock/import statements sit textually — no real network call to
// Razorpay happens in tests (there's nothing to call it with in this
// environment; see src/lib/payments/razorpay.ts).
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

import { cancelAppointment, holdSlot, listAvailableSlots, verifyPayment } from '@/modules/appointments/appointments.service';

function freshMobile(): string {
  return `9${randomInt(100000000, 999999999)}`;
}

function nextWeekdayAt(hour: number, minute: number, daysAhead = 2): Date {
  const d = new Date();
  d.setDate(d.getDate() + daysAhead);
  d.setHours(hour, minute, 0, 0);
  return d;
}

const createdUserIds: string[] = [];

async function registerUser(role: 'PATIENT' | 'DOCTOR' | 'ADMIN') {
  const mobile = freshMobile();
  if (role === 'ADMIN') await prisma.user.create({ data: { mobile: `+91${mobile}`, role: 'ADMIN' } });
  const { requestId } = await requestOtp(mobile, role);
  const { session } = await verifyOtp(requestId, '123456', true, {});
  createdUserIds.push(session.userId);
  return session.userId;
}

const pdf = { mimeType: 'application/pdf', size: 1024, buffer: Buffer.from('%PDF-1.4 test') };

async function approvedVideoDoctor(feeRupees = 500) {
  const doctorUserId = await registerUser('DOCTOR');
  await updateMe(
    doctorUserId,
    {
      firstName: 'Asha',
      lastName: 'Rao',
      registrationCouncil: 'Test Council',
      registrationNumber: `REG-${randomInt(100000000, 999999999)}`,
      primaryQualification: 'BAMS',
      yearsExperience: 8,
      specialties: ['General'],
      languages: ['English'],
      consultationModes: ['VIDEO'],
      videoFee: feeRupees,
    },
    { userId: doctorUserId },
  );
  await addDocument(doctorUserId, 'REGISTRATION_CERTIFICATE', { originalName: 'reg.pdf', ...pdf }, { userId: doctorUserId });
  await addDocument(doctorUserId, 'DEGREE_CERTIFICATE', { originalName: 'degree.pdf', ...pdf }, { userId: doctorUserId });
  await submit(doctorUserId, true, { userId: doctorUserId });

  const adminId = await registerUser('ADMIN');
  const doctorProfile = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: doctorUserId } });
  const docs = await prisma.doctorDocument.findMany({ where: { doctorProfileId: doctorProfile.id } });
  for (const doc of docs) await reviewDocument(doctorProfile.id, doc.id, { userId: adminId }, 'VERIFY');
  await approve(doctorProfile.id, { userId: adminId });

  const slotStart = nextWeekdayAt(9, 0);
  await addAvailability(doctorUserId, {
    dayOfWeek: slotStart.getDay(),
    startTime: '09:00',
    endTime: '10:00',
    mode: 'VIDEO',
    slotMinutes: 30,
  });

  return { doctorProfileId: doctorProfile.id, slotStart };
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

describe('appointment slot generation', () => {
  it('excludes a slot that has already been booked, but includes other slots in the window', async () => {
    const { doctorProfileId, slotStart } = await approvedVideoDoctor();
    const patientId = await registerUser('PATIENT');

    const before = await listAvailableSlots({ doctorProfileId, mode: 'VIDEO', days: 14 });
    expect(before.some((s) => s.startsAt === slotStart.toISOString())).toBe(true);

    await holdSlot(patientId, { doctorProfileId, mode: 'VIDEO', startsAt: slotStart.toISOString() });

    const after = await listAvailableSlots({ doctorProfileId, mode: 'VIDEO', days: 14 });
    expect(after.some((s) => s.startsAt === slotStart.toISOString())).toBe(false);
    expect(after.length).toBe(before.length - 1);
  });
});

describe('booking a slot', () => {
  it('prevents two patients from holding the same slot', async () => {
    const { doctorProfileId, slotStart } = await approvedVideoDoctor();
    const patientA = await registerUser('PATIENT');
    const patientB = await registerUser('PATIENT');

    await holdSlot(patientA, { doctorProfileId, mode: 'VIDEO', startsAt: slotStart.toISOString() });

    await expect(
      holdSlot(patientB, { doctorProfileId, mode: 'VIDEO', startsAt: slotStart.toISOString() }),
    ).rejects.toThrow(ConflictError);
  });

  it('refuses to start a booking when Razorpay is not configured', async () => {
    razorpayMock.isConfigured.mockReturnValue(false);
    const { doctorProfileId, slotStart } = await approvedVideoDoctor();
    const patientId = await registerUser('PATIENT');

    await expect(
      holdSlot(patientId, { doctorProfileId, mode: 'VIDEO', startsAt: slotStart.toISOString() }),
    ).rejects.toThrow(ServiceUnavailableError);
  });
});

describe('payment verification', () => {
  it('confirms the appointment and books the slot on a valid signature', async () => {
    const { doctorProfileId, slotStart } = await approvedVideoDoctor();
    const patientId = await registerUser('PATIENT');

    const { appointment, razorpayOrder } = await holdSlot(patientId, {
      doctorProfileId,
      mode: 'VIDEO',
      startsAt: slotStart.toISOString(),
    });

    const confirmed = await verifyPayment(
      patientId,
      {
        appointmentId: appointment.id,
        razorpayOrderId: razorpayOrder.id,
        razorpayPaymentId: 'pay_test123',
        razorpaySignature: 'sig_test123',
      },
      { userId: patientId },
    );

    expect(confirmed.status).toBe('CONFIRMED');
    const slot = await prisma.appointmentSlot.findUniqueOrThrow({ where: { id: appointment.slotId } });
    expect(slot.status).toBe('BOOKED');
    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: appointment.paymentId! } });
    expect(payment.status).toBe('SUCCESS');
    expect(payment.verifiedAt).not.toBeNull();
  });

  it('rejects an invalid signature and leaves the appointment awaiting payment', async () => {
    razorpayMock.verifySignature.mockReturnValueOnce(false);
    const { doctorProfileId, slotStart } = await approvedVideoDoctor();
    const patientId = await registerUser('PATIENT');

    const { appointment, razorpayOrder } = await holdSlot(patientId, {
      doctorProfileId,
      mode: 'VIDEO',
      startsAt: slotStart.toISOString(),
    });

    await expect(
      verifyPayment(
        patientId,
        {
          appointmentId: appointment.id,
          razorpayOrderId: razorpayOrder.id,
          razorpayPaymentId: 'pay_bad',
          razorpaySignature: 'forged',
        },
        { userId: patientId },
      ),
    ).rejects.toThrow(/verification failed/i);

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: appointment.paymentId! } });
    expect(payment.status).toBe('FAILED');
  });
});

describe('cancelling an appointment', () => {
  it('lets the patient cancel a confirmed appointment and frees the slot for rebooking', async () => {
    const { doctorProfileId, slotStart } = await approvedVideoDoctor();
    const patientId = await registerUser('PATIENT');

    const { appointment, razorpayOrder } = await holdSlot(patientId, {
      doctorProfileId,
      mode: 'VIDEO',
      startsAt: slotStart.toISOString(),
    });
    await verifyPayment(
      patientId,
      {
        appointmentId: appointment.id,
        razorpayOrderId: razorpayOrder.id,
        razorpayPaymentId: 'pay_test456',
        razorpaySignature: 'sig_test456',
      },
      { userId: patientId },
    );

    const cancelled = await cancelAppointment(patientId, 'PATIENT', appointment.id, { reason: 'Change of plans' }, {
      userId: patientId,
    });
    expect(cancelled.status).toBe('CANCELLED');

    const slot = await prisma.appointmentSlot.findUniqueOrThrow({ where: { id: appointment.slotId } });
    expect(slot.status).toBe('OPEN');

    // The freed slot is bookable again by another patient.
    const patientB = await registerUser('PATIENT');
    const rebooked = await holdSlot(patientB, { doctorProfileId, mode: 'VIDEO', startsAt: slotStart.toISOString() });
    expect(rebooked.appointment.id).not.toBe(appointment.id);
  });
});
