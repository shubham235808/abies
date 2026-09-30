// @vitest-environment node
import { randomInt } from 'crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { BadRequestError, ConflictError, NotFoundError } from '@/lib/errors';
import { requestOtp, verifyOtp } from '@/modules/auth/auth.service';
import { approve, reviewDocument } from '@/modules/doctors/admin-doctors.service';
import { addAvailability, addDocument, submit, updateMe } from '@/modules/doctors/doctors.service';

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
import { completeConsultation, startConsultation } from '@/modules/consultations/consultations.service';
import { approve as approvePharmacy } from '@/modules/medicines/admin-pharmacies.service';
import { addInventory } from '@/modules/medicines/catalogue.service';
import { acceptOrder, bookOrder, dispatchOrder, markDelivered, markPacking, verifyOrderPayment } from '@/modules/medicines/orders.service';
import { ensurePharmacyProfile, submitPharmacy, updateMyPharmacy } from '@/modules/medicines/pharmacies.service';
import { listForDoctor, listForMedicine, moderate, reviewDoctor, reviewMedicine } from '@/modules/reviews/reviews.service';

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

async function registerUser(role: 'PATIENT' | 'DOCTOR' | 'ADMIN' | 'PHARMACY') {
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

  return { doctorUserId, doctorProfileId: doctorProfile.id, slotStart };
}

// Books, pays for, and completes a fresh appointment slot with the given
// doctor so several patients can each leave one review against the same
// doctor (each call advances the day so slots never collide).
let appointmentDayOffset = 2;
async function completedAppointment(doctorUserId: string, doctorProfileId: string, patientId: string) {
  appointmentDayOffset += 1;
  const slotStart = nextWeekdayAt(9, 0, appointmentDayOffset);
  await addAvailability(doctorUserId, {
    dayOfWeek: slotStart.getDay(),
    startTime: '09:00',
    endTime: '10:00',
    mode: 'VIDEO',
    slotMinutes: 30,
  });

  const { appointment, razorpayOrder } = await holdSlot(patientId, { doctorProfileId, mode: 'VIDEO', startsAt: slotStart.toISOString() });
  await verifyPayment(
    patientId,
    { appointmentId: appointment.id, razorpayOrderId: razorpayOrder.id, razorpayPaymentId: `pay_${randomInt(1_000_000, 9_999_999)}`, razorpaySignature: 'sig' },
    { userId: patientId },
  );
  const consultation = await prisma.consultation.findUniqueOrThrow({ where: { appointmentId: appointment.id } });
  await startConsultation(doctorUserId, consultation.id);
  await completeConsultation(doctorUserId, consultation.id, { notes: 'All good' }, { userId: doctorUserId });
  return appointment.id;
}

async function approvedPharmacy() {
  const pharmacyUserId = await registerUser('PHARMACY');
  await updateMyPharmacy(
    pharmacyUserId,
    { name: 'Test Pharmacy', licenseNumbers: [`LIC-${randomInt(100000, 999999)}`], serviceAreas: ['Pune'] },
    { userId: pharmacyUserId },
  );
  await submitPharmacy(pharmacyUserId, true, { userId: pharmacyUserId });
  const adminId = await registerUser('ADMIN');
  const pharmacy = await ensurePharmacyProfile(pharmacyUserId);
  await approvePharmacy(pharmacy.id, { userId: adminId });
  return { pharmacyUserId, pharmacyId: pharmacy.id };
}

async function stockedOtcMedicine(pharmacyUserId: string, name = 'Cetirizine', quantity = 50, price = 30) {
  return addInventory(pharmacyUserId, {
    name,
    requiresPrescription: false,
    batchNumber: `B${randomInt(1000, 9999)}`,
    expiryDate: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
    quantityAvailable: quantity,
    price,
  });
}

// Books, pays for, and fully fulfils an OTC order so a patient can review
// the item, each call fresh so patients don't collide on stock.
async function deliveredOrder(pharmacyUserId: string, pharmacyId: string, patientId: string, medicineId: string) {
  const { order, razorpayOrder } = await bookOrder(patientId, { pharmacyId, deliveryAddress: 'Somewhere', items: [{ medicineId, quantity: 1 }] });
  await verifyOrderPayment(
    patientId,
    { orderId: order.id, razorpayOrderId: razorpayOrder.id, razorpayPaymentId: `pay_${randomInt(1000, 9999)}`, razorpaySignature: 'sig' },
    { userId: patientId },
  );
  await acceptOrder(pharmacyUserId, order.id);
  await markPacking(pharmacyUserId, order.id);
  await dispatchOrder(pharmacyUserId, order.id, { carrier: 'BlueDart', trackingRef: 'BD1' });
  await markDelivered(pharmacyUserId, order.id);
  return order.id;
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

describe('doctor reviews (EXPANSION-1c)', () => {
  it('lets a patient review a completed appointment, refuses a duplicate', async () => {
    const { doctorUserId, doctorProfileId } = await approvedVideoDoctor();
    const patientId = await registerUser('PATIENT');
    const appointmentId = await completedAppointment(doctorUserId, doctorProfileId, patientId);

    const review = await reviewDoctor(patientId, appointmentId, { rating: 5, comment: 'Great consult' });
    expect(review.targetId).toBe(doctorProfileId);

    await expect(reviewDoctor(patientId, appointmentId, { rating: 4 })).rejects.toThrow(ConflictError);
  });

  it('refuses to review an appointment that is not completed', async () => {
    const { doctorProfileId, slotStart } = await approvedVideoDoctor();
    const patientId = await registerUser('PATIENT');
    const { appointment, razorpayOrder } = await holdSlot(patientId, { doctorProfileId, mode: 'VIDEO', startsAt: slotStart.toISOString() });
    await verifyPayment(
      patientId,
      { appointmentId: appointment.id, razorpayOrderId: razorpayOrder.id, razorpayPaymentId: `pay_x`, razorpaySignature: 'sig' },
      { userId: patientId },
    );

    await expect(reviewDoctor(patientId, appointment.id, { rating: 5 })).rejects.toThrow(BadRequestError);
  });

  it("refuses to review someone else's appointment", async () => {
    const { doctorUserId, doctorProfileId } = await approvedVideoDoctor();
    const patientId = await registerUser('PATIENT');
    const stranger = await registerUser('PATIENT');
    const appointmentId = await completedAppointment(doctorUserId, doctorProfileId, patientId);

    await expect(reviewDoctor(stranger, appointmentId, { rating: 1 })).rejects.toThrow(NotFoundError);
  });

  it('keeps the aggregate rating at 0 below the minimum sample size, then activates it', async () => {
    const { doctorUserId, doctorProfileId } = await approvedVideoDoctor();

    const patient1 = await registerUser('PATIENT');
    const appt1 = await completedAppointment(doctorUserId, doctorProfileId, patient1);
    await reviewDoctor(patient1, appt1, { rating: 5 });
    let profile = await prisma.doctorProfile.findUniqueOrThrow({ where: { id: doctorProfileId } });
    expect(profile.rating).toBe(0); // 1 review — below MIN_SAMPLE_SIZE (3)
    expect(profile.reviewCount).toBe(1);

    const patient2 = await registerUser('PATIENT');
    const appt2 = await completedAppointment(doctorUserId, doctorProfileId, patient2);
    await reviewDoctor(patient2, appt2, { rating: 5 });
    profile = await prisma.doctorProfile.findUniqueOrThrow({ where: { id: doctorProfileId } });
    expect(profile.rating).toBe(0); // 2 reviews — still below threshold

    const patient3 = await registerUser('PATIENT');
    const appt3 = await completedAppointment(doctorUserId, doctorProfileId, patient3);
    await reviewDoctor(patient3, appt3, { rating: 1 });
    profile = await prisma.doctorProfile.findUniqueOrThrow({ where: { id: doctorProfileId } });
    expect(profile.reviewCount).toBe(3);
    expect(profile.rating).toBeCloseTo((5 + 5 + 1) / 3, 1); // threshold reached — real average now

    const reviews = await listForDoctor(doctorProfileId);
    expect(reviews).toHaveLength(3);
  });
});

describe('medicine reviews (EXPANSION-1c)', () => {
  it('lets a patient review a delivered order item, refuses a duplicate', async () => {
    const { pharmacyUserId, pharmacyId } = await approvedPharmacy();
    const stocked = await stockedOtcMedicine(pharmacyUserId, `Reviewable-${randomInt(1000, 9999)}`, 10, 50);
    const patientId = await registerUser('PATIENT');
    const orderId = await deliveredOrder(pharmacyUserId, pharmacyId, patientId, stocked.medicineId);

    const review = await reviewMedicine(patientId, orderId, { medicineId: stocked.medicineId, rating: 4, comment: 'Worked well' });
    expect(review.targetId).toBe(stocked.medicineId);

    await expect(reviewMedicine(patientId, orderId, { medicineId: stocked.medicineId, rating: 3 })).rejects.toThrow(ConflictError);
  });

  it('refuses to review an item that was not part of the order', async () => {
    const { pharmacyUserId, pharmacyId } = await approvedPharmacy();
    const stocked = await stockedOtcMedicine(pharmacyUserId, `InOrder-${randomInt(1000, 9999)}`, 10, 50);
    const other = await stockedOtcMedicine(pharmacyUserId, `NotInOrder-${randomInt(1000, 9999)}`, 10, 50);
    const patientId = await registerUser('PATIENT');
    const orderId = await deliveredOrder(pharmacyUserId, pharmacyId, patientId, stocked.medicineId);

    await expect(reviewMedicine(patientId, orderId, { medicineId: other.medicineId, rating: 5 })).rejects.toThrow(BadRequestError);
  });

  it('refuses to review an item from an order that has not been delivered yet', async () => {
    const { pharmacyUserId, pharmacyId } = await approvedPharmacy();
    const stocked = await stockedOtcMedicine(pharmacyUserId, `NotDelivered-${randomInt(1000, 9999)}`, 10, 50);
    const patientId = await registerUser('PATIENT');
    const { order, razorpayOrder } = await bookOrder(patientId, { pharmacyId, deliveryAddress: 'Somewhere', items: [{ medicineId: stocked.medicineId, quantity: 1 }] });
    await verifyOrderPayment(
      patientId,
      { orderId: order.id, razorpayOrderId: razorpayOrder.id, razorpayPaymentId: `pay_${randomInt(1000, 9999)}`, razorpaySignature: 'sig' },
      { userId: patientId },
    );

    await expect(reviewMedicine(patientId, order.id, { medicineId: stocked.medicineId, rating: 5 })).rejects.toThrow(BadRequestError);
  });

  it('keeps the aggregate rating at 0 below the minimum sample size, then activates it', async () => {
    const { pharmacyUserId, pharmacyId } = await approvedPharmacy();
    const stocked = await stockedOtcMedicine(pharmacyUserId, `Aggregate-${randomInt(1000, 9999)}`, 10, 50);

    for (const rating of [5, 4]) {
      const patientId = await registerUser('PATIENT');
      const orderId = await deliveredOrder(pharmacyUserId, pharmacyId, patientId, stocked.medicineId);
      await reviewMedicine(patientId, orderId, { medicineId: stocked.medicineId, rating });
    }
    let medicine = await prisma.medicine.findUniqueOrThrow({ where: { id: stocked.medicineId } });
    expect(medicine.rating).toBe(0); // 2 reviews — below threshold

    const patient3 = await registerUser('PATIENT');
    const orderId3 = await deliveredOrder(pharmacyUserId, pharmacyId, patient3, stocked.medicineId);
    await reviewMedicine(patient3, orderId3, { medicineId: stocked.medicineId, rating: 3 });

    medicine = await prisma.medicine.findUniqueOrThrow({ where: { id: stocked.medicineId } });
    expect(medicine.reviewCount).toBe(3);
    expect(medicine.rating).toBeCloseTo((5 + 4 + 3) / 3, 1);
  });
});

describe('review moderation (EXPANSION-1c)', () => {
  it('an admin hiding a review removes it from the public list and recomputes the aggregate', async () => {
    const { pharmacyUserId, pharmacyId } = await approvedPharmacy();
    const stocked = await stockedOtcMedicine(pharmacyUserId, `Moderated-${randomInt(1000, 9999)}`, 10, 50);
    const adminId = await registerUser('ADMIN');

    const ratings = [5, 5, 1];
    const reviewIds: string[] = [];
    for (const rating of ratings) {
      const patientId = await registerUser('PATIENT');
      const orderId = await deliveredOrder(pharmacyUserId, pharmacyId, patientId, stocked.medicineId);
      const review = await reviewMedicine(patientId, orderId, { medicineId: stocked.medicineId, rating });
      reviewIds.push(review.id);
    }

    let medicine = await prisma.medicine.findUniqueOrThrow({ where: { id: stocked.medicineId } });
    expect(medicine.reviewCount).toBe(3);

    await moderate(reviewIds[2]!, { status: 'HIDDEN' }, { userId: adminId });

    const visible = await listForMedicine(stocked.medicineId);
    expect(visible).toHaveLength(2);
    expect(visible.every((r) => r.id !== reviewIds[2])).toBe(true);

    medicine = await prisma.medicine.findUniqueOrThrow({ where: { id: stocked.medicineId } });
    expect(medicine.reviewCount).toBe(2); // back below threshold once the 1-star is hidden
    expect(medicine.rating).toBe(0);
  });
});
