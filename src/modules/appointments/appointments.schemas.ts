import { z } from 'zod';
import { consultationModeSchema } from '@/modules/doctors/doctors.schemas';

export const listSlotsQuerySchema = z.object({
  doctorProfileId: z.string().min(1),
  mode: consultationModeSchema.optional(),
  // ISO date (YYYY-MM-DD) to start scanning from; defaults to today.
  from: z.string().optional(),
  days: z.coerce.number().int().min(1).max(30).default(14),
});

export const holdSlotSchema = z.object({
  doctorProfileId: z.string().min(1),
  mode: consultationModeSchema,
  // Exact slot start, as returned by GET /api/appointments/slots.
  startsAt: z.string().datetime(),
  careRecipientFamilyMemberId: z.string().optional(),
  reasonForVisit: z.string().max(1000).optional(),
});

export const verifyPaymentSchema = z.object({
  appointmentId: z.string().min(1),
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export const cancelAppointmentSchema = z.object({
  reason: z.string().max(500).optional(),
});
