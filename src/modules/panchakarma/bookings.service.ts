import type { UserRole } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, ServiceUnavailableError } from '@/lib/errors';
import { createOrder, isConfigured, verifySignature } from '@/lib/payments/razorpay';
import { notify } from '@/modules/notifications/notifications.service';
import { computeCommission } from '@/modules/settlement/commission.service';
import { recordAuditEvent } from '@/server/audit';
import type { AuditContext } from '@/server/audit';
import type {
  bookTherapySchema,
  cancelBookingSchema,
  markSessionAttendedSchema,
  scheduleSessionSchema,
  verifyBookingPaymentSchema,
} from './bookings.schemas';
import type { z } from 'zod';

type BookTherapyInput = z.infer<typeof bookTherapySchema>;
type VerifyBookingPaymentInput = z.infer<typeof verifyBookingPaymentSchema>;
type CancelBookingInput = z.infer<typeof cancelBookingSchema>;
type ScheduleSessionInput = z.infer<typeof scheduleSessionSchema>;
type MarkSessionAttendedInput = z.infer<typeof markSessionAttendedSchema>;

async function releaseBooking(bookingId: string, reason: string) {
  await prisma.$transaction(async (tx) => {
    const booking = await tx.panchakarmaBooking.findUnique({ where: { id: bookingId } });
    if (!booking) return;
    await tx.panchakarmaBooking.update({
      where: { id: bookingId },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason },
    });
    if (booking.paymentId) await tx.payment.update({ where: { id: booking.paymentId }, data: { status: 'FAILED' } });
    if (booking.recommendationId) {
      await tx.panchakarmaRecommendation.update({ where: { id: booking.recommendationId }, data: { status: 'RECOMMENDED' } });
    }
  });
}

export async function bookTherapy(patientUserId: string, dto: BookTherapyInput) {
  if (!isConfigured()) {
    throw new ServiceUnavailableError('Online payments are not configured in this environment yet — booking is unavailable.');
  }

  const centre = await prisma.panchakarmaCentre.findFirst({ where: { id: dto.centreId, verificationStatus: 'APPROVED', active: true } });
  if (!centre) throw new NotFoundError('Centre not found');

  const therapy = await prisma.therapy.findFirst({ where: { id: dto.therapyId, centreId: centre.id, active: true } });
  if (!therapy) throw new NotFoundError('Therapy not found at this centre');

  if (dto.recommendationId) {
    // Same deliberate ordering as modules/diagnostics/orders.service.ts's
    // bookOrder: check existence first, bookability second, so a BOOKED
    // recommendation gets "already has an active booking" rather than
    // looking like it doesn't exist.
    const recommendation = await prisma.panchakarmaRecommendation.findFirst({
      where: { id: dto.recommendationId, patientUserId },
    });
    if (!recommendation) throw new NotFoundError('Recommendation not found');
    const existingActiveBooking = await prisma.panchakarmaBooking.findFirst({
      where: { recommendationId: dto.recommendationId, status: { not: 'CANCELLED' } },
    });
    if (existingActiveBooking) throw new ConflictError('This recommendation already has an active booking');
    if (recommendation.status !== 'RECOMMENDED') {
      throw new ConflictError('This recommendation is not available for booking');
    }
  }

  const totalPrice = therapy.price * dto.sessionCount;

  const { booking, paymentId } = await prisma.$transaction(async (tx) => {
    const created = await tx.panchakarmaBooking.create({
      data: {
        recommendationId: dto.recommendationId,
        centreId: centre.id,
        patientUserId,
        therapyId: therapy.id,
        sessionCount: dto.sessionCount,
      },
    });
    const payment = await tx.payment.create({
      data: { payerUserId: patientUserId, purpose: 'PANCHAKARMA_BOOKING', purposeEntityId: created.id, amount: totalPrice, status: 'CREATED' },
    });
    const booking = await tx.panchakarmaBooking.update({ where: { id: created.id }, data: { paymentId: payment.id } });
    if (dto.recommendationId) {
      await tx.panchakarmaRecommendation.update({ where: { id: dto.recommendationId }, data: { status: 'BOOKED' } });
    }
    return { booking, paymentId: payment.id };
  });

  try {
    const gatewayOrder = await createOrder({
      amountRupees: totalPrice,
      receipt: booking.id,
      notes: { panchakarmaBookingId: booking.id, centreId: centre.id },
    });
    const updatedPayment = await prisma.payment.update({
      where: { id: paymentId },
      data: { gatewayOrderId: gatewayOrder.id, status: 'PENDING' },
    });
    return { booking, payment: updatedPayment, razorpayOrder: gatewayOrder, razorpayKeyId: getEnv().RAZORPAY_KEY_ID };
  } catch (err) {
    await releaseBooking(booking.id, 'Payment gateway error while starting checkout');
    logger.error('panchakarma', 'razorpay order creation failed', err, { bookingId: booking.id });
    throw new ServiceUnavailableError('Could not start payment — please try again.');
  }
}

// Shared by the checkout-verification route and the webhook — idempotent,
// mirrors modules/medicines/orders.service.ts's finalizeMedicineOrderPaymentByOrder.
// The booking itself stays BOOKED (see the PanchakarmaBookingStatus schema
// comment) — payment.status is what actually flips.
export async function finalizeBookingPaymentByOrder(params: { gatewayOrderId: string; gatewayPaymentId: string; gatewaySignature: string }) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { gatewayOrderId: params.gatewayOrderId } });
    if (!payment) throw new NotFoundError('Payment not found for this booking');
    if (payment.status === 'SUCCESS') {
      return tx.panchakarmaBooking.findUniqueOrThrow({ where: { paymentId: payment.id } });
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
    return tx.panchakarmaBooking.findUniqueOrThrow({ where: { paymentId: payment.id } });
  });
}

export async function verifyBookingPayment(patientUserId: string, dto: VerifyBookingPaymentInput, auditCtx: AuditContext) {
  const booking = await prisma.panchakarmaBooking.findFirst({ where: { id: dto.bookingId, patientUserId }, include: { payment: true, centre: true } });
  if (!booking) throw new NotFoundError('Booking not found');
  if (!booking.payment || booking.payment.status !== 'PENDING') throw new ConflictError('This booking is not awaiting payment');
  if (booking.payment.gatewayOrderId !== dto.razorpayOrderId) throw new BadRequestError('Order mismatch');

  const valid = verifySignature({
    orderId: dto.razorpayOrderId,
    paymentId: dto.razorpayPaymentId,
    signature: dto.razorpaySignature,
  });
  if (!valid) {
    await prisma.payment.update({ where: { id: booking.payment.id }, data: { status: 'FAILED' } });
    throw new BadRequestError('Payment verification failed');
  }

  const confirmed = await finalizeBookingPaymentByOrder({
    gatewayOrderId: dto.razorpayOrderId,
    gatewayPaymentId: dto.razorpayPaymentId,
    gatewaySignature: dto.razorpaySignature,
  });

  await recordAuditEvent(auditCtx, {
    eventType: 'PANCHAKARMA_BOOKING',
    action: 'CONFIRMED',
    resourceType: 'PanchakarmaBooking',
    resourceId: booking.id,
  });
  await notify(patientUserId, 'IN_APP', 'panchakarma.booking_confirmed', { bookingId: booking.id });
  await notify(booking.centre.userId, 'IN_APP', 'panchakarma.booking_placed', { bookingId: booking.id });

  return confirmed;
}

export async function cancelBooking(actorUserId: string, role: UserRole, bookingId: string, dto: CancelBookingInput, auditCtx: AuditContext) {
  const booking = await prisma.panchakarmaBooking.findUnique({ where: { id: bookingId }, include: { centre: true } });
  if (!booking) throw new NotFoundError('Booking not found');

  const isOwnerPatient = role === 'PATIENT' && booking.patientUserId === actorUserId;
  const isOwnerCentre = role === 'PANCHAKARMA_CENTRE' && booking.centre.userId === actorUserId;
  if (!isOwnerPatient && !isOwnerCentre) throw new ForbiddenError('Not allowed to cancel this booking');

  if (booking.status !== 'BOOKED' && booking.status !== 'SCHEDULED') {
    throw new ConflictError('This booking can no longer be cancelled');
  }

  await prisma.$transaction(async (tx) => {
    await tx.panchakarmaBooking.update({
      where: { id: bookingId },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: dto.reason },
    });
    if (booking.recommendationId) {
      await tx.panchakarmaRecommendation.update({ where: { id: booking.recommendationId }, data: { status: 'RECOMMENDED' } });
    }
  });

  await recordAuditEvent(auditCtx, {
    eventType: 'PANCHAKARMA_BOOKING',
    action: 'CANCELLED',
    resourceType: 'PanchakarmaBooking',
    resourceId: bookingId,
    metadata: { cancelledBy: role },
  });

  const notifyUserId = isOwnerPatient ? booking.centre.userId : booking.patientUserId;
  await notify(notifyUserId, 'IN_APP', 'panchakarma.booking_cancelled', { bookingId });

  return prisma.panchakarmaBooking.findUniqueOrThrow({ where: { id: bookingId } });
}

async function ownedByCentre(centreUserId: string, bookingId: string) {
  const booking = await prisma.panchakarmaBooking.findUnique({ where: { id: bookingId }, include: { centre: true } });
  if (!booking || booking.centre.userId !== centreUserId) throw new NotFoundError('Booking not found');
  return booking;
}

export async function scheduleSession(centreUserId: string, bookingId: string, dto: ScheduleSessionInput) {
  const booking = await ownedByCentre(centreUserId, bookingId);
  if (booking.status !== 'BOOKED' && booking.status !== 'SCHEDULED' && booking.status !== 'IN_PROGRESS') {
    throw new BadRequestError('This booking cannot be scheduled further');
  }
  if (dto.therapistId) {
    const therapist = await prisma.therapist.findFirst({ where: { id: dto.therapistId, centreId: booking.centreId } });
    if (!therapist) throw new NotFoundError('Therapist not found at this centre');
  }

  const existingSessionCount = await prisma.panchakarmaSession.count({ where: { bookingId } });
  if (existingSessionCount >= booking.sessionCount) {
    throw new ConflictError('All sessions for this booking have already been scheduled');
  }

  const [session, updatedBooking] = await prisma.$transaction([
    prisma.panchakarmaSession.create({
      data: {
        bookingId,
        sessionNumber: existingSessionCount + 1,
        therapistId: dto.therapistId,
        scheduledAt: new Date(dto.scheduledAt),
      },
    }),
    prisma.panchakarmaBooking.update({
      where: { id: bookingId },
      data: booking.status === 'BOOKED' ? { status: 'SCHEDULED' } : {},
    }),
  ]);
  await notify(booking.patientUserId, 'IN_APP', 'panchakarma.session_scheduled', { bookingId, sessionId: session.id });
  return { session, booking: updatedBooking };
}

export async function markSessionAttended(centreUserId: string, sessionId: string, dto: MarkSessionAttendedInput) {
  const session = await prisma.panchakarmaSession.findUnique({ where: { id: sessionId }, include: { booking: { include: { centre: true } } } });
  if (!session || session.booking.centre.userId !== centreUserId) throw new NotFoundError('Session not found');
  if (session.attendedAt) throw new BadRequestError('This session is already marked attended');
  if (session.booking.status !== 'SCHEDULED' && session.booking.status !== 'IN_PROGRESS') {
    throw new BadRequestError('This booking is not in a state to record attendance');
  }

  const updatedSession = await prisma.panchakarmaSession.update({
    where: { id: sessionId },
    data: { attendedAt: new Date(), notes: dto.notes, exceptionFlag: dto.exceptionFlag },
  });

  const attendedCount = await prisma.panchakarmaSession.count({ where: { bookingId: session.bookingId, attendedAt: { not: null } } });
  const allAttended = attendedCount >= session.booking.sessionCount;
  const updatedBooking = await prisma.panchakarmaBooking.update({
    where: { id: session.bookingId },
    data: { status: allAttended ? 'COMPLETED' : 'IN_PROGRESS' },
  });

  if (allAttended) {
    await notify(session.booking.patientUserId, 'IN_APP', 'panchakarma.course_completed', { bookingId: session.bookingId });
    if (session.booking.recommendationId) {
      await prisma.panchakarmaRecommendation.update({ where: { id: session.booking.recommendationId }, data: { status: 'FULFILLED' } });
    }
    if (session.booking.paymentId) {
      await computeCommission({ partnerKind: 'PANCHAKARMA_CENTRE', partnerId: session.booking.centreId, paymentId: session.booking.paymentId });
    }
  }

  return { session: updatedSession, booking: updatedBooking };
}

function detailInclude() {
  return {
    centre: { select: { id: true, name: true, city: true, state: true } },
    patientUser: { select: { mobile: true, patientProfile: { select: { firstName: true, lastName: true } } } },
    therapy: { select: { name: true, durationMinutes: true } },
    sessions: { include: { therapist: { select: { name: true } } }, orderBy: { sessionNumber: 'asc' as const } },
    payment: { select: { status: true, amount: true } },
  };
}

export async function getBooking(userId: string, role: UserRole, bookingId: string) {
  const booking = await prisma.panchakarmaBooking.findUnique({ where: { id: bookingId }, include: { ...detailInclude(), centre: true } });
  if (!booking) throw new NotFoundError('Booking not found');
  const isPatient = role === 'PATIENT' && booking.patientUserId === userId;
  const isCentre = role === 'PANCHAKARMA_CENTRE' && booking.centre.userId === userId;
  if (!isPatient && !isCentre) throw new NotFoundError('Booking not found');
  return booking;
}

export async function listMineAsPatient(patientUserId: string) {
  return prisma.panchakarmaBooking.findMany({
    where: { patientUserId },
    include: {
      centre: { select: { name: true } },
      therapy: { select: { name: true } },
      sessions: { orderBy: { sessionNumber: 'asc' } },
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listMineAsCentre(centreUserId: string) {
  const centre = await prisma.panchakarmaCentre.findUnique({ where: { userId: centreUserId } });
  if (!centre) throw new NotFoundError('Centre profile not found');
  return prisma.panchakarmaBooking.findMany({
    where: { centreId: centre.id, payment: { status: 'SUCCESS' } },
    include: {
      patientUser: { select: { mobile: true, patientProfile: { select: { firstName: true, lastName: true } } } },
      therapy: { select: { name: true } },
      sessions: { orderBy: { sessionNumber: 'asc' } },
    },
    orderBy: { createdAt: 'asc' },
  });
}
