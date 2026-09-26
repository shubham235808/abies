import { z } from 'zod';

export const bookTherapySchema = z.object({
  centreId: z.string().min(1),
  therapyId: z.string().min(1),
  recommendationId: z.string().optional(),
  sessionCount: z.number().int().min(1).max(60),
});

export const verifyBookingPaymentSchema = z.object({
  bookingId: z.string().min(1),
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export const cancelBookingSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const scheduleSessionSchema = z.object({
  scheduledAt: z.string().datetime(),
  therapistId: z.string().optional(),
});

export const markSessionAttendedSchema = z.object({
  notes: z.string().max(2000).optional(),
  exceptionFlag: z.string().max(500).optional(),
});
