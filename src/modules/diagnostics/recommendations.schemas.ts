import { z } from 'zod';

const isoDate = z
  .string()
  .refine((v) => v === '' || !Number.isNaN(Date.parse(v)), 'Invalid date')
  .transform((v) => (v === '' ? undefined : v))
  .optional();

export const createRecommendationSchema = z.object({
  testId: z.string().optional(),
  carePlanItemId: z.string().optional(),
  clinicalReason: z.string().min(1).max(1000),
  targetCompletionDate: isoDate,
});
