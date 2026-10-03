import { z } from 'zod';

// Same '' -> undefined normalization used across the app (patients.schemas.ts,
// consultations.schemas.ts) for HTML <input type="date">.
const isoDate = z
  .string()
  .refine((v) => v === '' || !Number.isNaN(Date.parse(v)), 'Invalid date')
  .transform((v) => (v === '' ? undefined : v))
  .optional();

const requiredIsoDate = z.string().refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date');

export const carePlanStatusSchema = z.enum(['DRAFT', 'ACTIVE', 'PAUSED', 'COMPLETED', 'CANCELLED', 'SUPERSEDED']);
export const carePlanItemTypeSchema = z.enum([
  'CONSULTATION',
  'DIAGNOSTIC',
  'MEDICINE',
  'PANCHAKARMA',
  'LIFESTYLE',
  'DIET',
  'FOLLOW_UP',
  'TASK',
  'MILESTONE',
]);
export const carePlanItemStatusSchema = z.enum(['PLANNED', 'ACTIVE', 'COMPLETED', 'MISSED', 'CANCELLED']);
export const carePlanRelatedEntityTypeSchema = z.enum([
  'CONSULTATION',
  'DIAGNOSTIC_ORDER',
  'MEDICINE_ORDER',
  'PANCHAKARMA_BOOKING',
  'TASK',
]);

export const createCarePlanSchema = z.object({
  patientUserId: z.string().min(1),
  careRecipientFamilyMemberId: z.string().optional(),
  consultationId: z.string().optional(),
  startDate: requiredIsoDate,
  targetDate: isoDate,
  summary: z.string().max(2000).optional(),
  goals: z.array(z.string().min(1).max(300)).max(20).optional(),
});

export const updateCarePlanDetailsSchema = z.object({
  summary: z.string().max(2000).optional(),
  targetDate: isoDate,
  goals: z.array(z.string().min(1).max(300)).max(20).optional(),
});

export const transitionCarePlanSchema = z.object({
  status: carePlanStatusSchema,
});

export const createCarePlanItemSchema = z.object({
  type: carePlanItemTypeSchema,
  title: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  startDate: isoDate,
  dueDate: isoDate,
  relatedEntityType: carePlanRelatedEntityTypeSchema.optional(),
  relatedEntityId: z.string().optional(),
  ownerUserId: z.string().optional(),
  notes: z.string().max(2000).optional(),
});

export const updateCarePlanItemSchema = createCarePlanItemSchema.partial().extend({
  status: carePlanItemStatusSchema.optional(),
});
