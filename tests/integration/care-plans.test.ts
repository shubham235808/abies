// @vitest-environment node
import { randomInt } from 'crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/lib/errors';
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
import {
  acknowledgeCarePlanItem,
  addCarePlanItem,
  createCarePlan,
  getCarePlan,
  transitionCarePlan,
  updateCarePlanItem,
} from '@/modules/care-plans/care-plans.service';

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

describe('creating a care plan', () => {
  it('refuses to create a plan for a patient the doctor has no consultation history with', async () => {
    const { doctorUserId } = await approvedVideoDoctor();
    const strangerPatientId = await registerUser('PATIENT');

    await expect(
      createCarePlan(doctorUserId, { patientUserId: strangerPatientId, startDate: new Date().toISOString() }, { userId: doctorUserId }),
    ).rejects.toThrow(ForbiddenError);
  });

  it('allows creation once a consultation establishes the relationship', async () => {
    const { doctorUserId, patientId, consultationId } = await confirmedAppointment();
    const plan = await createCarePlan(
      doctorUserId,
      { patientUserId: patientId, consultationId, startDate: new Date().toISOString(), summary: 'Digestive reset' },
      { userId: doctorUserId },
    );
    expect(plan.status).toBe('DRAFT');
    expect(plan.summary).toBe('Digestive reset');
  });
});

describe('care plan status machine', () => {
  it('only allows documented transitions', async () => {
    const { doctorUserId, patientId, consultationId } = await confirmedAppointment();
    const plan = await createCarePlan(
      doctorUserId,
      { patientUserId: patientId, consultationId, startDate: new Date().toISOString() },
      { userId: doctorUserId },
    );

    // DRAFT cannot jump straight to COMPLETED.
    await expect(transitionCarePlan(doctorUserId, plan.id, 'COMPLETED', { userId: doctorUserId })).rejects.toThrow(BadRequestError);

    const active = await transitionCarePlan(doctorUserId, plan.id, 'ACTIVE', { userId: doctorUserId });
    expect(active.status).toBe('ACTIVE');

    const completed = await transitionCarePlan(doctorUserId, plan.id, 'COMPLETED', { userId: doctorUserId });
    expect(completed.status).toBe('COMPLETED');

    // Terminal state — no way out.
    await expect(transitionCarePlan(doctorUserId, plan.id, 'ACTIVE', { userId: doctorUserId })).rejects.toThrow(BadRequestError);
  });

  it('refuses a transition from a doctor who does not own the plan', async () => {
    const { doctorUserId, patientId, consultationId } = await confirmedAppointment();
    const plan = await createCarePlan(
      doctorUserId,
      { patientUserId: patientId, consultationId, startDate: new Date().toISOString() },
      { userId: doctorUserId },
    );
    const { doctorUserId: otherDoctorId } = await approvedVideoDoctor();
    await expect(transitionCarePlan(otherDoctorId, plan.id, 'ACTIVE', { userId: otherDoctorId })).rejects.toThrow(NotFoundError);
  });
});

describe('patient visibility and fulfilment vs clinical status', () => {
  it('hides a DRAFT plan from the patient, then reveals it once activated', async () => {
    const { doctorUserId, patientId, consultationId } = await confirmedAppointment();
    const plan = await createCarePlan(
      doctorUserId,
      { patientUserId: patientId, consultationId, startDate: new Date().toISOString() },
      { userId: doctorUserId },
    );

    await expect(getCarePlan(patientId, 'PATIENT', plan.id)).rejects.toThrow(NotFoundError);

    await transitionCarePlan(doctorUserId, plan.id, 'ACTIVE', { userId: doctorUserId });
    const patientView = await getCarePlan(patientId, 'PATIENT', plan.id);
    expect(patientView.id).toBe(plan.id);
  });

  it("keeps the patient's acknowledgement separate from the clinician-owned item status", async () => {
    const { doctorUserId, patientId, consultationId } = await confirmedAppointment();
    const plan = await createCarePlan(
      doctorUserId,
      { patientUserId: patientId, consultationId, startDate: new Date().toISOString() },
      { userId: doctorUserId },
    );
    await transitionCarePlan(doctorUserId, plan.id, 'ACTIVE', { userId: doctorUserId });
    const item = await addCarePlanItem(doctorUserId, plan.id, { type: 'TASK', title: 'Drink warm water each morning' });
    expect(item.status).toBe('PLANNED');

    const acknowledged = await acknowledgeCarePlanItem(patientId, item.id, true);
    expect(acknowledged.patientMarkedDoneAt).not.toBeNull();
    // The patient's acknowledgement never touches clinical status.
    expect(acknowledged.status).toBe('PLANNED');

    const clinicallyUpdated = await updateCarePlanItem(doctorUserId, item.id, { status: 'COMPLETED' });
    expect(clinicallyUpdated.status).toBe('COMPLETED');
    expect(clinicallyUpdated.completedDate).not.toBeNull();
    // The doctor's clinical update doesn't erase the patient's own flag.
    expect(clinicallyUpdated.patientMarkedDoneAt).not.toBeNull();
  });

  it('refuses a patient acknowledging an item on someone else\'s plan', async () => {
    const { doctorUserId, patientId, consultationId } = await confirmedAppointment();
    const plan = await createCarePlan(
      doctorUserId,
      { patientUserId: patientId, consultationId, startDate: new Date().toISOString() },
      { userId: doctorUserId },
    );
    await transitionCarePlan(doctorUserId, plan.id, 'ACTIVE', { userId: doctorUserId });
    const item = await addCarePlanItem(doctorUserId, plan.id, { type: 'TASK', title: 'Evening walk' });

    const strangerPatientId = await registerUser('PATIENT');
    await expect(acknowledgeCarePlanItem(strangerPatientId, item.id, true)).rejects.toThrow(NotFoundError);
  });
});
