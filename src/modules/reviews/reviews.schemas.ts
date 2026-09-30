import { z } from 'zod';

export const createDoctorReviewSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export const createMedicineReviewSchema = z.object({
  medicineId: z.string(),
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(1000).optional(),
});

export const moderateReviewSchema = z.object({
  status: z.enum(['PUBLISHED', 'HIDDEN']),
});
