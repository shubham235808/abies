// @vitest-environment node
import { randomInt } from 'crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@/lib/errors';
import { requestOtp, verifyOtp } from '@/modules/auth/auth.service';
import { approve as approveDoctor, reviewDocument } from '@/modules/doctors/admin-doctors.service';
import { addAvailability, addDocument, submit as submitDoctor, updateMe } from '@/modules/doctors/doctors.service';

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

import { holdSlot, verifyPayment } from '@/modules/appointments/appointments.service';
import { approve as approveCentre } from '@/modules/panchakarma/admin-centres.service';
import { createTherapy, searchPublic } from '@/modules/panchakarma/catalogue.service';
import { ensureCentreProfile, submitCentre, updateMyCentre } from '@/modules/panchakarma/centres.service';
import { createRecommendation } from '@/modules/panchakarma/recommendations.service';
import {
  bookTherapy,
  cancelBooking,
  getBooking,
  listMineAsCentre,
  markSessionAttended,
  scheduleSession,
  verifyBookingPayment,
} from '@/modules/panchakarma/bookings.service';

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

async function registerUser(role: 'PATIENT' | 'DOCTOR' | 'ADMIN' | 'PANCHAKARMA_CENTRE') {
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
  await submitDoctor(doctorUserId, true, { userId: doctorUserId });

  const adminId = await registerUser('ADMIN');
  const doctorProfile = await prisma.doctorProfile.findUniqueOrThrow({ where: { userId: doctorUserId } });
  const docs = await prisma.doctorDocument.findMany({ where: { doctorProfileId: doctorProfile.id } });
  for (const doc of docs) await reviewDocument(doctorProfile.id, doc.id, { userId: adminId }, true);
  await approveDoctor(doctorProfile.id, { userId: adminId });

  const slotStart = nextWeekdayAt(9, 0);
  await addAvailability(doctorUserId, {
    dayOfWeek: slotStart.getDay(),
    startTime: '09:00',
    endTime: '10:00',
    mode: 'VIDEO',
    slotMinutes: 30,
  });

  return { doctorUserId, doctorProfileId: doctorProfile.id, slotStart };
}

async function confirmedAppointment() {
  const { doctorUserId, doctorProfileId, slotStart } = await approvedVideoDoctor();
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
      razorpayPaymentId: `pay_${randomInt(1_000_000, 9_999_999)}`,
      razorpaySignature: 'sig_x',
    },
    { userId: patientId },
  );

  const consultation = await prisma.consultation.findUniqueOrThrow({ where: { appointmentId: appointment.id } });
  return { doctorUserId, patientId, consultationId: consultation.id };
}

async function approvedCentreWithTherapy(priceRupees = 800) {
  const centreUserId = await registerUser('PANCHAKARMA_CENTRE');
  await updateMyCentre(
    centreUserId,
    {
      name: 'Test Panchakarma Centre',
      addressLine1: '1 Wellness Road',
      city: 'Pune',
      state: 'Maharashtra',
      postalCode: '411001',
      supervisingPractitioner: 'Dr. Supervisor',
      licenseNumbers: [`LIC-${randomInt(100000, 999999)}`],
    },
    { userId: centreUserId },
  );
  await submitCentre(centreUserId, true, { userId: centreUserId });
  const adminId = await registerUser('ADMIN');
  const centre = await ensureCentreProfile(centreUserId);
  await approveCentre(centre.id, { userId: adminId });

  const therapy = await createTherapy(centreUserId, { name: `Abhyanga-${randomInt(1000, 9999)}`, price: priceRupees });
  return { centreUserId, centreId: centre.id, therapyId: therapy.id, price: priceRupees };
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

describe('centre catalogue and public visibility', () => {
  it('only shows therapies from an approved, active centre on the public catalogue', async () => {
    const centreUserId = await registerUser('PANCHAKARMA_CENTRE');
    await updateMyCentre(centreUserId, { name: 'Draft Centre', city: 'Pune' }, { userId: centreUserId });
    const therapy = await createTherapy(centreUserId, { name: 'Draft Therapy', price: 500 });

    const beforeApproval = await searchPublic({ q: 'Draft Therapy' });
    expect(beforeApproval.therapies.some((t) => t.id === therapy.id)).toBe(false);

    await updateMyCentre(
      centreUserId,
      { addressLine1: '1 Road', state: 'MH', postalCode: '411001', supervisingPractitioner: 'Dr. X', licenseNumbers: ['LIC-1'] },
      { userId: centreUserId },
    );
    await submitCentre(centreUserId, true, { userId: centreUserId });
    const adminId = await registerUser('ADMIN');
    const centre = await ensureCentreProfile(centreUserId);
    await approveCentre(centre.id, { userId: adminId });

    const afterApproval = await searchPublic({ q: 'Draft Therapy' });
    expect(afterApproval.therapies.some((t) => t.id === therapy.id)).toBe(true);
  });
});

describe('doctor recommendations', () => {
  it('refuses to let a doctor recommend a therapy on a consultation they do not own', async () => {
    const { consultationId } = await confirmedAppointment();
    const { doctorUserId: strangerDoctorId } = await approvedVideoDoctor();

    await expect(
      createRecommendation(strangerDoctorId, consultationId, { clinicalReason: 'Routine detox' }, { userId: strangerDoctorId }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('booking a therapy', () => {
  it('books, pays, and confirms — moving the recommendation to BOOKED', async () => {
    const { doctorUserId, patientId, consultationId } = await confirmedAppointment();
    const { centreId, therapyId, price } = await approvedCentreWithTherapy();

    const recommendation = await createRecommendation(
      doctorUserId,
      consultationId,
      { clinicalReason: 'Chronic stiffness', therapyId, sessionCountRecommended: 4 },
      { userId: doctorUserId },
    );

    const { booking, razorpayOrder } = await bookTherapy(patientId, {
      centreId,
      therapyId,
      recommendationId: recommendation.id,
      sessionCount: 4,
    });
    expect(booking.status).toBe('BOOKED');

    const confirmed = await verifyBookingPayment(
      patientId,
      { bookingId: booking.id, razorpayOrderId: razorpayOrder.id, razorpayPaymentId: `pay_${randomInt(1000, 9999)}`, razorpaySignature: 'sig' },
      { userId: patientId },
    );
    expect(confirmed.status).toBe('BOOKED');

    const updatedRecommendation = await prisma.panchakarmaRecommendation.findUniqueOrThrow({ where: { id: recommendation.id } });
    expect(updatedRecommendation.status).toBe('BOOKED');

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: booking.paymentId! } });
    expect(payment.amount).toBe(price * 4);
  });

  it('refuses a second active booking against the same recommendation', async () => {
    const { doctorUserId, patientId, consultationId } = await confirmedAppointment();
    const { centreId, therapyId } = await approvedCentreWithTherapy();
    const recommendation = await createRecommendation(doctorUserId, consultationId, { clinicalReason: 'Check', therapyId }, { userId: doctorUserId });

    await bookTherapy(patientId, { centreId, therapyId, recommendationId: recommendation.id, sessionCount: 2 });

    await expect(
      bookTherapy(patientId, { centreId, therapyId, recommendationId: recommendation.id, sessionCount: 2 }),
    ).rejects.toThrow(ConflictError);
  });

  it('cancelling a booked course frees the recommendation for rebooking', async () => {
    const { doctorUserId, patientId, consultationId } = await confirmedAppointment();
    const { centreId, therapyId } = await approvedCentreWithTherapy();
    const recommendation = await createRecommendation(doctorUserId, consultationId, { clinicalReason: 'Check', therapyId }, { userId: doctorUserId });

    const { booking } = await bookTherapy(patientId, { centreId, therapyId, recommendationId: recommendation.id, sessionCount: 2 });

    await cancelBooking(patientId, 'PATIENT', booking.id, {}, { userId: patientId });
    const resetRecommendation = await prisma.panchakarmaRecommendation.findUniqueOrThrow({ where: { id: recommendation.id } });
    expect(resetRecommendation.status).toBe('RECOMMENDED');

    const rebooked = await bookTherapy(patientId, { centreId, therapyId, recommendationId: recommendation.id, sessionCount: 3 });
    expect(rebooked.booking.id).not.toBe(booking.id);
  });
});

describe('centre fulfilment', () => {
  async function paidBooking(sessionCount = 2) {
    const patientId = await registerUser('PATIENT');
    const { centreUserId, centreId, therapyId } = await approvedCentreWithTherapy();
    const { booking, razorpayOrder } = await bookTherapy(patientId, { centreId, therapyId, sessionCount });
    await verifyBookingPayment(
      patientId,
      { bookingId: booking.id, razorpayOrderId: razorpayOrder.id, razorpayPaymentId: `pay_${randomInt(1000, 9999)}`, razorpaySignature: 'sig' },
      { userId: patientId },
    );
    return { centreUserId, patientId, bookingId: booking.id };
  }

  it('walks a paid booking through scheduling, attendance, and course completion', async () => {
    const { centreUserId, patientId, bookingId } = await paidBooking(2);

    const first = await scheduleSession(centreUserId, bookingId, { scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
    expect(first.booking.status).toBe('SCHEDULED');
    expect(first.session.sessionNumber).toBe(1);

    const afterFirstAttended = await markSessionAttended(centreUserId, first.session.id, { notes: 'Went well' });
    expect(afterFirstAttended.booking.status).toBe('IN_PROGRESS');

    const second = await scheduleSession(centreUserId, bookingId, { scheduledAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() });
    expect(second.session.sessionNumber).toBe(2);

    const afterSecondAttended = await markSessionAttended(centreUserId, second.session.id, {});
    expect(afterSecondAttended.booking.status).toBe('COMPLETED');

    const booking = await getBooking(patientId, 'PATIENT', bookingId);
    expect(booking.sessions).toHaveLength(2);
    expect(booking.sessions.every((s) => s.attendedAt)).toBe(true);
  });

  it('refuses to schedule beyond the booked session count', async () => {
    const { centreUserId, bookingId } = await paidBooking(1);
    await scheduleSession(centreUserId, bookingId, { scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });

    await expect(
      scheduleSession(centreUserId, bookingId, { scheduledAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString() }),
    ).rejects.toThrow(ConflictError);
  });

  it('refuses a centre acting on a booking it does not own', async () => {
    const { bookingId } = await paidBooking(1);
    const { centreUserId: otherCentreUserId } = await approvedCentreWithTherapy();
    await expect(
      scheduleSession(otherCentreUserId, bookingId, { scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() }),
    ).rejects.toThrow(NotFoundError);
  });

  it('excludes unpaid bookings from the centre booking list', async () => {
    const patientId = await registerUser('PATIENT');
    const { centreUserId, centreId, therapyId } = await approvedCentreWithTherapy();
    await bookTherapy(patientId, { centreId, therapyId, sessionCount: 1 });

    const bookings = await listMineAsCentre(centreUserId);
    expect(bookings).toHaveLength(0);
  });

  it("refuses a non-owning patient from cancelling someone else's booking", async () => {
    const { bookingId } = await paidBooking(1);
    const strangerPatientId = await registerUser('PATIENT');
    await expect(cancelBooking(strangerPatientId, 'PATIENT', bookingId, {}, { userId: strangerPatientId })).rejects.toThrow(ForbiddenError);
  });

  it('refuses marking a session attended twice', async () => {
    const { centreUserId, bookingId } = await paidBooking(1);
    const { session } = await scheduleSession(centreUserId, bookingId, { scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString() });
    await markSessionAttended(centreUserId, session.id, {});
    await expect(markSessionAttended(centreUserId, session.id, {})).rejects.toThrow(BadRequestError);
  });
});
