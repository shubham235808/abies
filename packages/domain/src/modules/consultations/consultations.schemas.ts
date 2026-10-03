import { z } from 'zod';

// Same '' -> undefined normalization as patients.schemas.ts's isoDate, for
// the same reason: an HTML <input type="date"> submits '' when cleared,
// which a bare .optional() string schema still rejects.
const isoDate = z
  .string()
  .refine((v) => v === '' || !Number.isNaN(Date.parse(v)), 'Invalid date')
  .transform((v) => (v === '' ? undefined : v))
  .optional();

export const updateConsultationDetailsSchema = z.object({
  chiefComplaint: z.string().max(2000).optional(),
  historyOfPresentIllness: z.string().max(4000).optional(),
  notes: z.string().max(8000).optional(),
});

export const saveClinicalNoteSchema = z.object({
  ayurvedaAssessment: z.record(z.string(), z.string().max(500)).optional(),
  diagnosis: z.string().max(2000).optional(),
  treatmentPlan: z.string().max(4000).optional(),
  recommendations: z.string().max(4000).optional(),
  followUpDate: isoDate,
});

export const prescriptionItemSchema = z.object({
  productName: z.string().min(1).max(200),
  dosage: z.string().max(200).optional(),
  frequency: z.string().max(200).optional(),
  durationDays: z.number().int().min(1).max(365).optional(),
  route: z.string().max(100).optional(),
  instructions: z.string().max(1000).optional(),
  startDate: isoDate,
  endDate: isoDate,
});

export const savePrescriptionSchema = z.object({
  doctorNotes: z.string().max(2000).optional(),
  items: z.array(prescriptionItemSchema).min(1).max(30),
});
