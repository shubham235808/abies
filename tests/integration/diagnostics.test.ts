// @vitest-environment node
import { randomInt } from 'crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@abies/domain/lib/db';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@abies/domain/lib/errors';
import { requestOtp, verifyOtp } from '@abies/domain/modules/auth/auth.service';
import { approve as approveDoctor, reviewDocument } from '@abies/domain/modules/doctors/admin-doctors.service';
import { addAvailability, addDocument, submit as submitDoctor, updateMe } from '@abies/domain/modules/doctors/doctors.service';

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
vi.mock('@abies/domain/lib/payments/razorpay', () => razorpayMock);

import { holdSlot, verifyPayment } from '@abies/domain/modules/appointments/appointments.service';
import { approve as approveLab } from '@abies/domain/modules/diagnostics/admin-labs.service';
import { createPackage, createTest, searchPackagesPublic, searchPublic } from '@abies/domain/modules/diagnostics/catalogue.service';
import { bookOrderSchema } from '@abies/domain/modules/diagnostics/orders.schemas';
import { ensureLabProfile, submitLab, updateMyLab } from '@abies/domain/modules/diagnostics/labs.service';
import { createRecommendation } from '@abies/domain/modules/diagnostics/recommendations.service';
import {
  bookOrder,
  cancelOrder,
  getOrder,
  listMineAsLab,
  markProcessing,
  markSampleCollected,
  releaseReport,
  verifyOrderPayment,
} from '@abies/domain/modules/diagnostics/orders.service';

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

async function registerUser(role: 'PATIENT' | 'DOCTOR' | 'ADMIN' | 'LAB') {
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
  for (const doc of docs) await reviewDocument(doctorProfile.id, doc.id, { userId: adminId }, 'VERIFY');
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

async function approvedLabWithTest(priceRupees = 400) {
  const labUserId = await registerUser('LAB');
  await updateMyLab(
    labUserId,
    { name: 'Test Diagnostics Lab', licenseNumbers: [`LIC-${randomInt(100000, 999999)}`], serviceCities: ['Pune'], homeCollectionSupported: true },
    { userId: labUserId },
  );
  await submitLab(labUserId, true, { userId: labUserId });
  const adminId = await registerUser('ADMIN');
  const lab = await ensureLabProfile(labUserId);
  await approveLab(lab.id, { userId: adminId });

  const test = await createTest(labUserId, { code: `CBC-${randomInt(1000, 9999)}`, name: 'Complete Blood Count', price: priceRupees });
  return { labUserId, labId: lab.id, testId: test.id, price: priceRupees };
}

async function approvedLabWithPackage(testPriceRupees = 400, packagePriceRupees = 650) {
  const { labUserId, labId, testId } = await approvedLabWithTest(testPriceRupees);
  const secondTest = await createTest(labUserId, { code: `LFT-${randomInt(1000, 9999)}`, name: 'Liver Function Test', price: 300 });
  const pkg = await createPackage(labUserId, {
    name: 'Full Body Health Check',
    description: 'CBC + LFT bundle',
    price: packagePriceRupees,
    active: true,
    testIds: [testId, secondTest.id],
  });
  return { labUserId, labId, packageId: pkg.id, price: packagePriceRupees };
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

describe('lab catalogue and public visibility', () => {
  it('only shows tests from an approved, active lab on the public catalogue', async () => {
    const labUserId = await registerUser('LAB');
    await updateMyLab(labUserId, { name: 'Draft Lab', licenseNumbers: ['LIC-1'], serviceCities: ['Pune'] }, { userId: labUserId });
    const test = await createTest(labUserId, { code: 'X1', name: 'Draft Test', price: 300 });

    const beforeApproval = await searchPublic({ q: 'Draft Test' });
    expect(beforeApproval.tests.some((t) => t.id === test.id)).toBe(false);

    await submitLab(labUserId, true, { userId: labUserId });
    const adminId = await registerUser('ADMIN');
    const lab = await ensureLabProfile(labUserId);
    await approveLab(lab.id, { userId: adminId });

    const afterApproval = await searchPublic({ q: 'Draft Test' });
    expect(afterApproval.tests.some((t) => t.id === test.id)).toBe(true);
  });
});

describe('doctor recommendations', () => {
  it('refuses to let a doctor recommend a test on a consultation they do not own', async () => {
    const { consultationId } = await confirmedAppointment();
    const { doctorUserId: strangerDoctorId } = await approvedVideoDoctor();

    await expect(
      createRecommendation(strangerDoctorId, consultationId, { clinicalReason: 'Routine check' }, { userId: strangerDoctorId }),
    ).rejects.toThrow(NotFoundError);
  });
});

describe('booking a diagnostic order', () => {
  it('books, pays, and confirms — moving the recommendation to BOOKED', async () => {
    const { doctorUserId, patientId, consultationId } = await confirmedAppointment();
    const { labId, testId, price } = await approvedLabWithTest();

    const recommendation = await createRecommendation(
      doctorUserId,
      consultationId,
      { clinicalReason: 'Suspected anemia', testId },
      { userId: doctorUserId },
    );

    const { order, razorpayOrder } = await bookOrder(patientId, {
      labId,
      testIds: [testId],
      recommendationId: recommendation.id,
      collectionMode: 'LAB_VISIT',
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(order.status).toBe('BOOKED');

    const confirmed = await verifyOrderPayment(
      patientId,
      { orderId: order.id, razorpayOrderId: razorpayOrder.id, razorpayPaymentId: `pay_${randomInt(1000, 9999)}`, razorpaySignature: 'sig' },
      { userId: patientId },
    );
    expect(confirmed.status).toBe('SCHEDULED');

    const updatedRecommendation = await prisma.diagnosticRecommendation.findUniqueOrThrow({ where: { id: recommendation.id } });
    expect(updatedRecommendation.status).toBe('BOOKED');

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: order.paymentId! } });
    expect(payment.amount).toBe(price);
  });

  it('refuses a second active order against the same recommendation', async () => {
    const { doctorUserId, patientId, consultationId } = await confirmedAppointment();
    const { labId, testId } = await approvedLabWithTest();
    const recommendation = await createRecommendation(doctorUserId, consultationId, { clinicalReason: 'Check', testId }, { userId: doctorUserId });

    await bookOrder(patientId, {
      labId,
      testIds: [testId],
      recommendationId: recommendation.id,
      collectionMode: 'LAB_VISIT',
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    await expect(
      bookOrder(patientId, {
        labId,
        testIds: [testId],
        recommendationId: recommendation.id,
        collectionMode: 'LAB_VISIT',
        scheduledAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
      }),
    ).rejects.toThrow(ConflictError);
  });

  it('requires an address for home collection at a lab that supports it', async () => {
    const patientId = await registerUser('PATIENT');
    const { labId, testId } = await approvedLabWithTest();

    await expect(
      bookOrder(patientId, {
        labId,
        testIds: [testId],
        collectionMode: 'HOME',
        scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
      }),
    ).rejects.toThrow(BadRequestError);
  });

  it('cancelling a booked order frees the recommendation for rebooking', async () => {
    const { doctorUserId, patientId, consultationId } = await confirmedAppointment();
    const { labId, testId } = await approvedLabWithTest();
    const recommendation = await createRecommendation(doctorUserId, consultationId, { clinicalReason: 'Check', testId }, { userId: doctorUserId });

    const { order } = await bookOrder(patientId, {
      labId,
      testIds: [testId],
      recommendationId: recommendation.id,
      collectionMode: 'LAB_VISIT',
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    await cancelOrder(patientId, 'PATIENT', order.id, {}, { userId: patientId });
    const resetRecommendation = await prisma.diagnosticRecommendation.findUniqueOrThrow({ where: { id: recommendation.id } });
    expect(resetRecommendation.status).toBe('RECOMMENDED');

    const rebooked = await bookOrder(patientId, {
      labId,
      testIds: [testId],
      recommendationId: recommendation.id,
      collectionMode: 'LAB_VISIT',
      scheduledAt: new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString(),
    });
    expect(rebooked.order.id).not.toBe(order.id);
  });
});

describe('lab fulfilment', () => {
  async function scheduledOrder() {
    const { patientId } = await confirmedAppointment();
    const { labUserId, labId, testId } = await approvedLabWithTest();
    const { order, razorpayOrder } = await bookOrder(patientId, {
      labId,
      testIds: [testId],
      collectionMode: 'LAB_VISIT',
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    await verifyOrderPayment(
      patientId,
      { orderId: order.id, razorpayOrderId: razorpayOrder.id, razorpayPaymentId: `pay_${randomInt(1000, 9999)}`, razorpaySignature: 'sig' },
      { userId: patientId },
    );
    return { labUserId, patientId, orderId: order.id };
  }

  it('walks a booked order through collection, processing, and report release', async () => {
    const { labUserId, patientId, orderId } = await scheduledOrder();

    const collected = await markSampleCollected(labUserId, orderId, { collectorName: 'Ramesh' });
    expect(collected.status).toBe('SAMPLE_COLLECTED');

    const processing = await markProcessing(labUserId, orderId);
    expect(processing.status).toBe('PROCESSING');

    const released = await releaseReport(labUserId, orderId, { criticalFlag: false }, null, { userId: labUserId });
    expect(released.status).toBe('COMPLETED');

    const reportRows = await prisma.report.findMany({ where: { patientUserId: patientId, sourceEntityId: orderId } });
    expect(reportRows).toHaveLength(1);
    expect(reportRows[0]?.kind).toBe('DIAGNOSTIC_REPORT');

    const order = await getOrder(patientId, 'PATIENT', orderId);
    expect(order.report?.releasedToPatientAt).not.toBeNull();
  });

  it('refuses a lab acting on an order it does not own', async () => {
    const { orderId } = await scheduledOrder();
    const { labUserId: otherLabUserId } = await approvedLabWithTest();
    await expect(markSampleCollected(otherLabUserId, orderId, {})).rejects.toThrow(NotFoundError);
  });

  it('excludes unpaid (BOOKED) orders from the lab order list', async () => {
    const { patientId } = await confirmedAppointment();
    const { labUserId, labId, testId } = await approvedLabWithTest();
    await bookOrder(patientId, {
      labId,
      testIds: [testId],
      collectionMode: 'LAB_VISIT',
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    const orders = await listMineAsLab(labUserId);
    expect(orders.every((o) => o.status !== 'BOOKED')).toBe(true);
  });

  it('refuses a non-owning patient from cancelling someone else\'s order', async () => {
    const { orderId } = await scheduledOrder();
    const strangerPatientId = await registerUser('PATIENT');
    await expect(cancelOrder(strangerPatientId, 'PATIENT', orderId, {}, { userId: strangerPatientId })).rejects.toThrow(ForbiddenError);
  });
});

describe('diagnostic packages (ENTERPRISE-6)', () => {
  it('only shows packages from an approved, active lab on the public catalogue', async () => {
    const { packageId } = await approvedLabWithPackage();
    const { packages } = await searchPackagesPublic({ q: 'Full Body' });
    expect(packages.some((p) => p.id === packageId)).toBe(true);
  });

  it('books a package at its own bundled price, not the sum of its tests', async () => {
    const { patientId } = await confirmedAppointment();
    const { labId, packageId, price } = await approvedLabWithPackage(400, 650);

    const { order, razorpayOrder } = await bookOrder(patientId, {
      labId,
      packageId,
      collectionMode: 'LAB_VISIT',
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(order.status).toBe('BOOKED');

    await verifyOrderPayment(
      patientId,
      { orderId: order.id, razorpayOrderId: razorpayOrder.id, razorpayPaymentId: `pay_${randomInt(1000, 9999)}`, razorpaySignature: 'sig' },
      { userId: patientId },
    );

    const payment = await prisma.payment.findUniqueOrThrow({ where: { id: order.paymentId! } });
    expect(payment.amount).toBe(price);

    const fullOrder = await getOrder(patientId, 'PATIENT', order.id);
    expect(fullOrder.items[0]?.package?.name).toBe('Full Body Health Check');
  });

  it('rejects a booking payload that mixes testIds and packageId at the schema layer', () => {
    const result = bookOrderSchema.safeParse({
      labId: 'lab_1',
      packageId: 'pkg_1',
      testIds: ['test_1'],
      collectionMode: 'LAB_VISIT',
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
    expect(result.success).toBe(false);
  });

  it('lets a doctor recommend a package on their own consultation', async () => {
    const { doctorUserId, patientId, consultationId } = await confirmedAppointment();
    const { labId, packageId } = await approvedLabWithPackage();

    const recommendation = await createRecommendation(
      doctorUserId,
      consultationId,
      { clinicalReason: 'Preventive screening', packageId },
      { userId: doctorUserId },
    );
    expect(recommendation.packageId).toBe(packageId);

    const { order } = await bookOrder(patientId, {
      labId,
      packageId,
      recommendationId: recommendation.id,
      collectionMode: 'LAB_VISIT',
      scheduledAt: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });

    const updatedRecommendation = await prisma.diagnosticRecommendation.findUniqueOrThrow({ where: { id: recommendation.id } });
    expect(updatedRecommendation.status).toBe('BOOKED');

    const fullOrder = await getOrder(patientId, 'PATIENT', order.id);
    expect(fullOrder.items[0]?.package?.name).toBeDefined();
  });
});
