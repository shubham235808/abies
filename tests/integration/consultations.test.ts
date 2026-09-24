// @vitest-environment node
import { randomInt } from 'crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@/lib/db';
import { ForbiddenError, NotFoundError } from '@/lib/errors';
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
  completeConsultation,
  finalizeClinicalNote,
  getConsultation,
  saveClinicalNote,
  startConsultation,
} from '@/modules/consultations/consultations.service';
import { correctPrescription, createPrescription, finalizePrescription } from '@/modules/consultations/prescriptions.service';

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
  for (const doc of docs) await reviewDocument(doctorProfile.id, doc.id, { userId: adminId }, true);
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

describe('consultation lifecycle', () => {
  it('confirming payment creates a SCHEDULED consultation automatically', async () => {
    const { consultationId } = await confirmedAppointment();
    const consultation = await prisma.consultation.findUniqueOrThrow({ where: { id: consultationId } });
    expect(consultation.status).toBe('SCHEDULED');
  });

  it('starting a VIDEO consultation moves it to IN_PROGRESS and creates a VideoSession', async () => {
    const { doctorUserId, consultationId } = await confirmedAppointment();
    await startConsultation(doctorUserId, consultationId);

    const consultation = await prisma.consultation.findUniqueOrThrow({ where: { id: consultationId } });
    expect(consultation.status).toBe('IN_PROGRESS');
    expect(consultation.startedAt).not.toBeNull();

    const session = await prisma.videoSession.findUnique({ where: { consultationId } });
    expect(session).not.toBeNull();
  });

  it('refuses to let another doctor start someone else\'s consultation', async () => {
    const { consultationId } = await confirmedAppointment();
    const { doctorUserId: attackerId } = await approvedVideoDoctor();
    await expect(startConsultation(attackerId, consultationId)).rejects.toThrow(NotFoundError);
  });

  it('completing a consultation also marks the appointment COMPLETED', async () => {
    const { doctorUserId, consultationId } = await confirmedAppointment();
    await startConsultation(doctorUserId, consultationId);
    await completeConsultation(doctorUserId, consultationId, { notes: 'All good' }, { userId: doctorUserId });

    const consultation = await prisma.consultation.findUniqueOrThrow({ where: { id: consultationId }, include: { appointment: true } });
    expect(consultation.status).toBe('COMPLETED');
    expect(consultation.appointment.status).toBe('COMPLETED');
  });
});

describe('clinical notes', () => {
  it('is hidden from the patient until finalized, then becomes visible and immutable', async () => {
    const { doctorUserId, patientId, consultationId } = await confirmedAppointment();
    await startConsultation(doctorUserId, consultationId);
    await saveClinicalNote(doctorUserId, consultationId, { diagnosis: 'Vata imbalance', ayurvedaAssessment: { agni: 'Manda' } });

    const patientView = await getConsultation(patientId, 'PATIENT', consultationId);
    expect(patientView.clinicalNote).toBeNull();

    await finalizeClinicalNote(doctorUserId, consultationId, { userId: doctorUserId });

    const patientViewAfter = await getConsultation(patientId, 'PATIENT', consultationId);
    expect(patientViewAfter.clinicalNote?.diagnosis).toBe('Vata imbalance');

    await expect(saveClinicalNote(doctorUserId, consultationId, { diagnosis: 'changed' })).rejects.toThrow(ForbiddenError);
  });
});

describe('prescriptions', () => {
  it('stays hidden from the patient as a draft, then visible once finalized', async () => {
    const { doctorUserId, patientId, consultationId } = await confirmedAppointment();
    await startConsultation(doctorUserId, consultationId);

    const draft = await createPrescription(doctorUserId, consultationId, {
      items: [{ productName: 'Triphala churna', dosage: '1 tsp', frequency: 'at night' }],
    });
    expect(draft.status).toBe('DRAFT');

    let patientView = await getConsultation(patientId, 'PATIENT', consultationId);
    expect(patientView.prescriptions).toHaveLength(0);

    await finalizePrescription(doctorUserId, draft.id, { userId: doctorUserId });

    patientView = await getConsultation(patientId, 'PATIENT', consultationId);
    expect(patientView.prescriptions).toHaveLength(1);
    expect(patientView.prescriptions[0]?.status).toBe('FINALIZED');
  });

  it('never mutates a finalized prescription — a correction supersedes it with a new draft', async () => {
    const { doctorUserId, consultationId } = await confirmedAppointment();
    await startConsultation(doctorUserId, consultationId);

    const draft = await createPrescription(doctorUserId, consultationId, {
      items: [{ productName: 'Ashwagandha', dosage: '500mg' }],
    });
    const finalized = await finalizePrescription(doctorUserId, draft.id, { userId: doctorUserId });

    const correction = await correctPrescription(doctorUserId, finalized.id, { userId: doctorUserId });
    expect(correction.id).not.toBe(finalized.id);
    expect(correction.status).toBe('DRAFT');
    expect(correction.supersedesId).toBe(finalized.id);
    expect(correction.items).toHaveLength(1);
    expect(correction.items[0]?.productName).toBe('Ashwagandha');

    const original = await prisma.prescription.findUniqueOrThrow({
      where: { id: finalized.id },
      include: { items: true },
    });
    expect(original.status).toBe('SUPERSEDED');
    // The original row's own items are untouched by the correction — it got
    // a fresh copy, not a shared reference.
    expect(original.items).toHaveLength(1);
    expect(original.items[0]?.productName).toBe('Ashwagandha');
  });
});
