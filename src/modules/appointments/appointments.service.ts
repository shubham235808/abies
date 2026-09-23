import { ConsultationMode, Prisma, type UserRole } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, ServiceUnavailableError } from '@/lib/errors';
import { createOrder, isConfigured, verifySignature } from '@/lib/payments/razorpay';
import { notify } from '@/modules/notifications/notifications.service';
import { recordAuditEvent } from '@/server/audit';
import type { AuditContext } from '@/server/audit';
import type { cancelAppointmentSchema, holdSlotSchema, listSlotsQuerySchema, verifyPaymentSchema } from './appointments.schemas';
import type { z } from 'zod';

type ListSlotsQuery = z.infer<typeof listSlotsQuerySchema>;
type HoldSlotInput = z.infer<typeof holdSlotSchema>;
type VerifyPaymentInput = z.infer<typeof verifyPaymentSchema>;
type CancelInput = z.infer<typeof cancelAppointmentSchema>;

// Booking is generated on demand from DoctorAvailability, never
// pre-materialized (docs/DOMAIN-MODEL.md §4). A patient must be able to
// start checkout at least this far ahead of a slot's start time.
const LEAD_TIME_MS = 30 * 60 * 1000;
const HOLD_DURATION_MS = 10 * 60 * 1000;

function toMinutes(hhmm: string): number {
  const [h, m] = hhmm.split(':');
  return Number(h) * 60 + Number(m);
}

export async function listAvailableSlots(query: ListSlotsQuery) {
  const profile = await prisma.doctorProfile.findFirst({
    where: { id: query.doctorProfileId, verificationStatus: 'APPROVED', isDiscoverable: true },
    include: { availability: { where: { active: true } } },
  });
  if (!profile) throw new NotFoundError('Doctor not found');

  const now = new Date();
  const fromDate = query.from ? new Date(query.from) : new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (Number.isNaN(fromDate.getTime())) throw new BadRequestError('Invalid "from" date');

  const windows = profile.availability.filter((a) => !query.mode || a.mode === query.mode);

  const candidates: { startsAt: Date; endsAt: Date; mode: ConsultationMode; clinicId: string | null }[] = [];
  for (let i = 0; i < query.days; i++) {
    const day = new Date(fromDate.getFullYear(), fromDate.getMonth(), fromDate.getDate() + i);
    const dow = day.getDay();
    for (const w of windows.filter((a) => a.dayOfWeek === dow)) {
      const startMin = toMinutes(w.startTime);
      const endMin = toMinutes(w.endTime);
      for (let t = startMin; t + w.slotMinutes <= endMin; t += w.slotMinutes) {
        const startsAt = new Date(day.getFullYear(), day.getMonth(), day.getDate(), Math.floor(t / 60), t % 60);
        if (startsAt.getTime() - now.getTime() < LEAD_TIME_MS) continue;
        candidates.push({
          startsAt,
          endsAt: new Date(startsAt.getTime() + w.slotMinutes * 60_000),
          mode: w.mode,
          clinicId: w.clinicId,
        });
      }
    }
  }
  if (candidates.length === 0) return [];
  candidates.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime());
  const rangeStart = candidates[0]!.startsAt;
  const rangeEnd = candidates[candidates.length - 1]!.startsAt;

  const existing = await prisma.appointmentSlot.findMany({
    where: { doctorProfileId: profile.id, startsAt: { gte: rangeStart, lte: rangeEnd } },
  });
  const blocked = new Set(
    existing
      .filter((s) => s.status === 'BOOKED' || (s.status === 'HELD' && s.heldUntil !== null && s.heldUntil > now))
      .map((s) => `${s.mode}|${s.startsAt.toISOString()}`),
  );

  return candidates
    .filter((c) => !blocked.has(`${c.mode}|${c.startsAt.toISOString()}`))
    .map((c) => ({
      startsAt: c.startsAt.toISOString(),
      endsAt: c.endsAt.toISOString(),
      mode: c.mode,
      clinicId: c.clinicId,
    }));
}

async function resolveWindow(doctorProfileId: string, mode: ConsultationMode, startsAt: Date) {
  const dayOfWeek = startsAt.getDay();
  const timeMin = startsAt.getHours() * 60 + startsAt.getMinutes();
  const windows = await prisma.doctorAvailability.findMany({
    where: { doctorProfileId, mode, dayOfWeek, active: true },
  });
  for (const w of windows) {
    const startMin = toMinutes(w.startTime);
    const endMin = toMinutes(w.endTime);
    if (timeMin < startMin || timeMin + w.slotMinutes > endMin) continue;
    if ((timeMin - startMin) % w.slotMinutes !== 0) continue;
    return { clinicId: w.clinicId, slotMinutes: w.slotMinutes, endsAt: new Date(startsAt.getTime() + w.slotMinutes * 60_000) };
  }
  return null;
}

// Atomically claims a slot: create it HELD if it doesn't exist yet, or
// flip it OPEN/expired-HELD -> HELD if it does. The conditional UPDATE's
// WHERE clause is what actually prevents double booking — under default
// READ COMMITTED, Postgres serializes concurrent UPDATEs to the same row,
// and the loser's WHERE re-evaluates against the (now HELD) row and
// matches nothing, so its `count` comes back 0. No SELECT ... FOR UPDATE
// needed because the UPDATE itself takes the row lock.
async function holdSlotRow(
  tx: Prisma.TransactionClient,
  params: {
    doctorProfileId: string;
    clinicId: string | null;
    mode: ConsultationMode;
    startsAt: Date;
    endsAt: Date;
    heldByUserId: string;
    heldUntil: Date;
  },
) {
  const uniqueWhere = {
    doctorProfileId_startsAt_mode: { doctorProfileId: params.doctorProfileId, startsAt: params.startsAt, mode: params.mode },
  };
  let existing = await tx.appointmentSlot.findUnique({ where: uniqueWhere });
  let created: typeof existing = null;

  if (!existing) {
    try {
      created = await tx.appointmentSlot.create({
        data: {
          doctorProfileId: params.doctorProfileId,
          clinicId: params.clinicId,
          mode: params.mode,
          startsAt: params.startsAt,
          endsAt: params.endsAt,
          status: 'HELD',
          heldByUserId: params.heldByUserId,
          heldUntil: params.heldUntil,
        },
      });
    } catch (err) {
      if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') throw err;
      // Lost the create race to a concurrent request — fall through and
      // contend for the row it created instead.
    }
  }
  if (created) return created;

  existing = existing ?? (await tx.appointmentSlot.findUniqueOrThrow({ where: uniqueWhere }));

  const now = new Date();
  const isFree = existing.status === 'OPEN' || (existing.status === 'HELD' && existing.heldUntil !== null && existing.heldUntil < now);
  if (!isFree) throw new ConflictError('This slot was just booked by someone else — please pick another.');

  const result = await tx.appointmentSlot.updateMany({
    where: { id: existing.id, OR: [{ status: 'OPEN' }, { status: 'HELD', heldUntil: { lt: now } }] },
    data: { status: 'HELD', heldByUserId: params.heldByUserId, heldUntil: params.heldUntil, clinicId: params.clinicId },
  });
  if (result.count !== 1) throw new ConflictError('This slot was just booked by someone else — please pick another.');
  return tx.appointmentSlot.findUniqueOrThrow({ where: { id: existing.id } });
}

async function releaseAppointment(appointmentId: string, reason: string) {
  await prisma.$transaction(async (tx) => {
    const appt = await tx.appointment.findUnique({ where: { id: appointmentId } });
    if (!appt) return;
    await tx.appointmentSlot.update({
      where: { id: appt.slotId },
      data: { status: 'OPEN', heldByUserId: null, heldUntil: null },
    });
    await tx.appointment.update({
      where: { id: appointmentId },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason },
    });
    if (appt.paymentId) {
      await tx.payment.update({ where: { id: appt.paymentId }, data: { status: 'FAILED' } });
    }
  });
}

export async function holdSlot(userId: string, dto: HoldSlotInput) {
  if (!isConfigured()) {
    throw new ServiceUnavailableError('Online payments are not configured in this environment yet — booking is unavailable.');
  }

  const profile = await prisma.doctorProfile.findFirst({
    where: { id: dto.doctorProfileId, verificationStatus: 'APPROVED', isDiscoverable: true },
  });
  if (!profile) throw new NotFoundError('Doctor not found');
  if (!profile.consultationModes.includes(dto.mode)) {
    throw new BadRequestError(`This doctor does not offer ${dto.mode} consultations`);
  }
  const fee = dto.mode === ConsultationMode.VIDEO ? profile.videoFee : profile.clinicFee;
  if (fee == null) throw new BadRequestError('This doctor has not set a fee for this consultation mode yet');

  const startsAt = new Date(dto.startsAt);
  if (Number.isNaN(startsAt.getTime()) || startsAt.getTime() - Date.now() < LEAD_TIME_MS) {
    throw new BadRequestError('This slot is too soon or no longer valid');
  }

  const window = await resolveWindow(profile.id, dto.mode, startsAt);
  if (!window) throw new ConflictError("This slot is no longer part of the doctor's availability");

  if (dto.careRecipientFamilyMemberId) {
    const member = await prisma.familyMember.findFirst({
      where: { id: dto.careRecipientFamilyMemberId, patientProfile: { userId } },
    });
    if (!member) throw new BadRequestError('Family member not found');
  }

  const heldUntil = new Date(Date.now() + HOLD_DURATION_MS);

  const { appointment, payment } = await prisma.$transaction(async (tx) => {
    const slot = await holdSlotRow(tx, {
      doctorProfileId: profile.id,
      clinicId: window.clinicId,
      mode: dto.mode,
      startsAt,
      endsAt: window.endsAt,
      heldByUserId: userId,
      heldUntil,
    });

    const appointment = await tx.appointment.create({
      data: {
        patientUserId: userId,
        careRecipientFamilyMemberId: dto.careRecipientFamilyMemberId,
        doctorProfileId: profile.id,
        slotId: slot.id,
        mode: dto.mode,
        clinicId: window.clinicId,
        scheduledAt: startsAt,
        durationMinutes: window.slotMinutes,
        reasonForVisit: dto.reasonForVisit,
        status: 'PENDING_PAYMENT',
      },
    });

    const payment = await tx.payment.create({
      data: { payerUserId: userId, purpose: 'CONSULTATION', purposeEntityId: appointment.id, amount: fee, status: 'CREATED' },
    });

    const updatedAppointment = await tx.appointment.update({ where: { id: appointment.id }, data: { paymentId: payment.id } });

    return { appointment: updatedAppointment, payment };
  });

  try {
    const order = await createOrder({
      amountRupees: fee,
      receipt: appointment.id,
      notes: { appointmentId: appointment.id, doctorProfileId: profile.id },
    });
    const updatedPayment = await prisma.payment.update({
      where: { id: payment.id },
      data: { gatewayOrderId: order.id, status: 'PENDING' },
    });
    return { appointment, payment: updatedPayment, razorpayOrder: order, razorpayKeyId: getEnv().RAZORPAY_KEY_ID };
  } catch (err) {
    await releaseAppointment(appointment.id, 'Payment gateway error while starting checkout');
    console.error('[appointments] razorpay order creation failed', err);
    throw new ServiceUnavailableError('Could not start payment — please try again.');
  }
}

// Shared by the checkout-verification route and the webhook — both end up
// here keyed by the gateway order id, and this is idempotent so whichever
// arrives second is a no-op rather than a double-confirm.
async function finalizePaymentSuccessByOrder(params: { gatewayOrderId: string; gatewayPaymentId: string; gatewaySignature: string }) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { gatewayOrderId: params.gatewayOrderId } });
    if (!payment) throw new NotFoundError('Payment not found for this order');
    if (payment.status === 'SUCCESS') {
      return tx.appointment.findUniqueOrThrow({ where: { paymentId: payment.id } });
    }
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCESS',
        gatewayPaymentId: params.gatewayPaymentId,
        gatewaySignature: params.gatewaySignature,
        verifiedAt: new Date(),
      },
    });
    const appointment = await tx.appointment.update({ where: { paymentId: payment.id }, data: { status: 'CONFIRMED' } });
    await tx.appointmentSlot.update({
      where: { id: appointment.slotId },
      data: { status: 'BOOKED', heldByUserId: null, heldUntil: null },
    });
    return appointment;
  });
}

export async function verifyPayment(userId: string, dto: VerifyPaymentInput, auditCtx: AuditContext) {
  const appointment = await prisma.appointment.findFirst({
    where: { id: dto.appointmentId, patientUserId: userId },
    include: { payment: true, doctorProfile: true },
  });
  if (!appointment) throw new NotFoundError('Appointment not found');
  if (appointment.status !== 'PENDING_PAYMENT' || !appointment.payment) {
    throw new ConflictError('This appointment is not awaiting payment');
  }
  if (appointment.payment.gatewayOrderId !== dto.razorpayOrderId) {
    throw new BadRequestError('Order mismatch');
  }

  const valid = verifySignature({
    orderId: dto.razorpayOrderId,
    paymentId: dto.razorpayPaymentId,
    signature: dto.razorpaySignature,
  });
  if (!valid) {
    await prisma.payment.update({ where: { id: appointment.payment.id }, data: { status: 'FAILED' } });
    throw new BadRequestError('Payment verification failed');
  }

  const confirmed = await finalizePaymentSuccessByOrder({
    gatewayOrderId: dto.razorpayOrderId,
    gatewayPaymentId: dto.razorpayPaymentId,
    gatewaySignature: dto.razorpaySignature,
  });

  await recordAuditEvent(auditCtx, {
    eventType: 'APPOINTMENT',
    action: 'CONFIRMED',
    resourceType: 'Appointment',
    resourceId: appointment.id,
  });

  await notify(userId, 'IN_APP', 'appointment.confirmed', { appointmentId: appointment.id });
  await notify(appointment.doctorProfile.userId, 'IN_APP', 'appointment.booked', { appointmentId: appointment.id });

  return confirmed;
}

export async function handleRazorpayWebhookPayment(payment: { order_id?: string; id?: string }) {
  if (!payment.order_id || !payment.id) return;
  try {
    await finalizePaymentSuccessByOrder({ gatewayOrderId: payment.order_id, gatewayPaymentId: payment.id, gatewaySignature: 'webhook' });
  } catch (err) {
    console.error('[appointments] webhook finalize failed', err);
  }
}

export async function cancelAppointment(actorUserId: string, role: UserRole, appointmentId: string, dto: CancelInput, auditCtx: AuditContext) {
  const appointment = await prisma.appointment.findUnique({
    where: { id: appointmentId },
    include: { doctorProfile: true },
  });
  if (!appointment) throw new NotFoundError('Appointment not found');

  const isOwnerPatient = role === 'PATIENT' && appointment.patientUserId === actorUserId;
  const isOwnerDoctor = role === 'DOCTOR' && appointment.doctorProfile.userId === actorUserId;
  if (!isOwnerPatient && !isOwnerDoctor) throw new ForbiddenError('Not allowed to cancel this appointment');

  if (appointment.status !== 'PENDING_PAYMENT' && appointment.status !== 'CONFIRMED') {
    throw new ConflictError('This appointment can no longer be cancelled');
  }

  await prisma.$transaction(async (tx) => {
    await tx.appointment.update({
      where: { id: appointmentId },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancelledBy: actorUserId, cancellationReason: dto.reason },
    });
    await tx.appointmentSlot.update({
      where: { id: appointment.slotId },
      data: { status: 'OPEN', heldByUserId: null, heldUntil: null },
    });
  });

  await recordAuditEvent(auditCtx, {
    eventType: 'APPOINTMENT',
    action: 'CANCELLED',
    resourceType: 'Appointment',
    resourceId: appointmentId,
    metadata: { cancelledBy: role },
  });

  const notifyUserId = isOwnerPatient ? appointment.doctorProfile.userId : appointment.patientUserId;
  await notify(notifyUserId, 'IN_APP', 'appointment.cancelled', { appointmentId });

  return prisma.appointment.findUniqueOrThrow({ where: { id: appointmentId } });
}

export async function listMineAsPatient(userId: string) {
  return prisma.appointment.findMany({
    where: { patientUserId: userId },
    include: {
      doctorProfile: { select: { slug: true, title: true, firstName: true, lastName: true } },
      careRecipientFamilyMember: { select: { name: true } },
      payment: { select: { status: true, amount: true } },
      clinic: { select: { name: true, city: true } },
    },
    orderBy: { scheduledAt: 'desc' },
  });
}

export async function listMineAsDoctor(userId: string) {
  const profile = await prisma.doctorProfile.findUnique({ where: { userId } });
  if (!profile) throw new NotFoundError('Doctor profile not found');
  return prisma.appointment.findMany({
    where: { doctorProfileId: profile.id },
    include: {
      patientUser: { select: { mobile: true, patientProfile: { select: { firstName: true, lastName: true } } } },
      careRecipientFamilyMember: { select: { name: true } },
      clinic: { select: { name: true, city: true } },
    },
    orderBy: { scheduledAt: 'desc' },
  });
}
