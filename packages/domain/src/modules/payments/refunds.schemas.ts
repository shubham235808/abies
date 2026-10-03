import { z } from 'zod';

export const requestRefundSchema = z.object({
  paymentId: z.string().min(1),
  amount: z.number().int().positive(),
  reason: z.string().max(1000).optional(),
});

export const rejectRefundSchema = z.object({
  reason: z.string().max(1000).optional(),
});
