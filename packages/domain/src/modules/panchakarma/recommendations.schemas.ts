import { z } from 'zod';

export const createRecommendationSchema = z.object({
  therapyId: z.string().optional(),
  carePlanItemId: z.string().optional(),
  clinicalReason: z.string().min(1).max(1000),
  sessionCountRecommended: z.number().int().min(1).max(60).optional(),
});
