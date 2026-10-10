// @vitest-environment node
import { randomInt } from 'crypto';
import { afterAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '@abies/domain/lib/db';
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

import { holdSlot, myPracticeSummary, verifyPayment } from '@abies/domain/modules/appointments/appointments.service';
import { operationalVolumeReport, partnerFunnelReport, revenueReport, supportSlaReport, toCsv } from '@abies/domain/modules/admin/reports.service';
import { createLead, updateLead } from '@abies/domain/modules/partners/leads.service';
import { createTicket, supportVolumeBreakdown, updateStatus } from '@abies/domain/modules/support/tickets.service';

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
const createdLeadIds: string[] = [];

async function registerUser(role: 'PATIENT' | 'DOCTOR' | 'ADMIN') {
  const mobile = freshMobile();
  if (role === 'ADMIN') await prisma.user.create({ data: { mobile: `+91${mobile}`, role: 'ADMIN' } });
  const { requestId } = await requestOtp({ mobile }, role);
  const { session } = await verifyOtp(requestId, '123456', true, {}, 'Test User');
  createdUserIds.push(session.userId);
  return session.userId;
}

const pdf = { mimeType: 'application/pdf', size: 1024, buffer: Buffer.from('%PDF-1.4 test') };

async function confirmedPaidAppointment(feeRupees = 500) {
  const doctorUserId = await registerUser('DOCTOR');
  await updateMe(
    doctorUserId,
    {
      firstName: 'Report',
      lastName: 'Doctor',
      registrationCouncil: 'Test Council',
      registrationNumber: `REG-${randomInt(100000000, 999999999)}`,
      primaryQualification: 'BAMS',
      yearsExperience: 5,
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
  await addAvailability(doctorUserId, { dayOfWeek: slotStart.getDay(), startTime: '09:00', endTime: '10:00', mode: 'VIDEO', slotMinutes: 30 });

  const patientId = await registerUser('PATIENT');
  const { appointment, razorpayOrder } = await holdSlot(patientId, { doctorProfileId: doctorProfile.id, mode: 'VIDEO', startsAt: slotStart.toISOString() });
  await verifyPayment(
    patientId,
    { appointmentId: appointment.id, razorpayOrderId: razorpayOrder.id, razorpayPaymentId: `pay_${randomInt(1_000_000, 9_999_999)}`, razorpaySignature: 'sig' },
    { userId: patientId },
  );
  return { doctorUserId, patientId, appointmentId: appointment.id, fee: feeRupees };
}

afterAll(async () => {
  if (createdUserIds.length) await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  if (createdLeadIds.length) await prisma.partnerLead.deleteMany({ where: { id: { in: createdLeadIds } } });
  await prisma.$disconnect();
});

beforeEach(() => {
  razorpayMock.isConfigured.mockReturnValue(true);
  razorpayMock.verifySignature.mockReturnValue(true);
});

describe('admin reports (ENTERPRISE-14)', () => {
  it('counts a payment in revenueReport only when its date falls inside the range', async () => {
    const { fee } = await confirmedPaidAppointment(650);
    const now = new Date();
    const wideRange = { from: new Date(now.getTime() - 60 * 60 * 1000), to: new Date(now.getTime() + 60 * 60 * 1000) };
    const narrowFutureRange = { from: new Date(now.getTime() + 10 * 60 * 60 * 1000), to: new Date(now.getTime() + 20 * 60 * 60 * 1000) };

    const withinRange = await revenueReport(wideRange);
    const consultationRow = withinRange.find((r) => r.purpose === 'CONSULTATION');
    expect(consultationRow?.totalAmount).toBeGreaterThanOrEqual(fee);

    const outsideRange = await revenueReport(narrowFutureRange);
    expect(outsideRange.find((r) => r.purpose === 'CONSULTATION')).toBeUndefined();
  });

  it('counts an appointment in operationalVolumeReport by service and status', async () => {
    await confirmedPaidAppointment(500);
    const now = new Date();
    const rows = await operationalVolumeReport({ from: new Date(now.getTime() - 60 * 60 * 1000), to: new Date(now.getTime() + 60 * 60 * 1000) });
    const row = rows.find((r) => r.service === 'Appointment' && r.status === 'CONFIRMED');
    expect(row?.count).toBeGreaterThanOrEqual(1);
  });

  it('flags an open ticket past its SLA response target as breached, and computes resolution time for resolved ones', async () => {
    const patientId = await registerUser('PATIENT');
    const breached = await createTicket(patientId, 'PATIENT', { category: 'GENERAL', subject: 'x', description: 'y'.repeat(10) }, { userId: patientId });
    // P4's response target is 24h — backdate creation so responseDueAt is already in the past.
    await prisma.supportTicket.update({
      where: { id: breached.id },
      data: { createdAt: new Date(Date.now() - 48 * 60 * 60 * 1000), sla: { priority: 'P4', responseTargetMinutes: 1440, responseDueAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), resolutionTarget: 'x' } },
    });

    const resolvedTicketPatient = await registerUser('PATIENT');
    const resolved = await createTicket(resolvedTicketPatient, 'PATIENT', { category: 'GENERAL', subject: 'x', description: 'y'.repeat(10) }, { userId: resolvedTicketPatient });
    const staffId = await registerUser('ADMIN');
    await updateStatus(resolved.id, staffId, 'ADMIN', { status: 'IN_PROGRESS' }, { userId: staffId });
    await updateStatus(resolved.id, staffId, 'ADMIN', { status: 'RESOLVED' }, { userId: staffId });

    const now = new Date();
    const report = await supportSlaReport({ from: new Date(now.getTime() - 72 * 60 * 60 * 1000), to: new Date(now.getTime() + 60 * 60 * 1000) });
    const customerSupportRow = report.find((r) => r.department === 'CUSTOMER_SUPPORT');
    expect(customerSupportRow?.slaBreached).toBeGreaterThanOrEqual(1);
    expect(customerSupportRow?.resolved).toBeGreaterThanOrEqual(1);
    expect(customerSupportRow?.avgResolutionHours).not.toBeNull();
  });

  it('computes the partner funnel conversion rate and avg days to activate', async () => {
    const salesId = await registerUser('ADMIN');
    const activated = await createLead(salesId, 'ADMIN', { kind: 'LAB', contactName: 'Report Lab', contactPhone: '9800000010' }, { userId: salesId });
    createdLeadIds.push(activated.id);
    await updateLead(activated.id, { stage: 'ACTIVATED' }, { userId: salesId });

    const rejected = await createLead(salesId, 'ADMIN', { kind: 'PHARMACY', contactName: 'Report Pharmacy', contactPhone: '9800000011' }, { userId: salesId });
    createdLeadIds.push(rejected.id);
    await updateLead(rejected.id, { stage: 'REJECTED' }, { userId: salesId });

    const now = new Date();
    const report = await partnerFunnelReport({ from: new Date(now.getTime() - 60 * 60 * 1000), to: new Date(now.getTime() + 60 * 60 * 1000) });
    expect(report.total).toBeGreaterThanOrEqual(2);
    expect(report.activated).toBeGreaterThanOrEqual(1);
    expect(report.rejected).toBeGreaterThanOrEqual(1);
    expect(report.avgDaysToActivate).not.toBeNull();
  });

  it('escapes commas and quotes when converting rows to CSV', () => {
    const csv = toCsv([{ name: 'Smith, John', note: 'Said "hello"' }]);
    expect(csv).toBe('name,note\n"Smith, John","Said ""hello"""');
  });
});

describe('doctor practice summary (ENTERPRISE-14)', () => {
  it('counts this month\'s completed consultations and their revenue', async () => {
    const { doctorUserId, appointmentId, fee } = await confirmedPaidAppointment(700);
    // A COMPLETED appointment is necessarily in the past — the fixture
    // books 2 days in the future (appointments.service.ts requires a
    // future slot to hold it), so backdate scheduledAt after confirming,
    // same as a real appointment's day actually arriving and concluding.
    await prisma.appointment.update({ where: { id: appointmentId }, data: { status: 'COMPLETED', scheduledAt: new Date(Date.now() - 60 * 60 * 1000) } });

    const summary = await myPracticeSummary(doctorUserId);
    expect(summary.completed).toBe(1);
    expect(summary.revenue).toBe(fee);
  });
});

describe('support volume breakdown (ENTERPRISE-14)', () => {
  it('counts open tickets by priority and category for a department', async () => {
    const patientId = await registerUser('PATIENT');
    await createTicket(patientId, 'PATIENT', { category: 'PAYMENT', subject: 'x', description: 'y'.repeat(10) }, { userId: patientId });

    const breakdown = await supportVolumeBreakdown('CUSTOMER_SUPPORT');
    expect(breakdown.open).toBeGreaterThanOrEqual(1);
    const paymentRow = breakdown.byCategory.find(([key]) => key === 'PAYMENT');
    expect(paymentRow?.[1]).toBeGreaterThanOrEqual(1);
  });
});
