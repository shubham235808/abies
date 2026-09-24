import { z } from 'zod';

export const updateLabProfileSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  licenseNumbers: z.array(z.string().min(1).max(100)).max(20).optional(),
  serviceCities: z.array(z.string().min(1).max(100)).max(50).optional(),
  homeCollectionSupported: z.boolean().optional(),
});

export const submitLabApplicationSchema = z.object({
  declarationAccepted: z.boolean(),
});

export const adminLabQueueQuerySchema = z.object({
  status: z.enum(['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED']).optional(),
});

export const rejectOrSuspendLabSchema = z.object({
  reason: z.string().min(1, 'A reason is required').max(2000),
});
