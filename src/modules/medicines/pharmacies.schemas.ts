import { z } from 'zod';

export const updatePharmacyProfileSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  licenseNumbers: z.array(z.string().min(1).max(100)).max(20).optional(),
  serviceAreas: z.array(z.string().min(1).max(100)).max(50).optional(),
});

export const submitPharmacyApplicationSchema = z.object({
  declarationAccepted: z.boolean(),
});

export const adminPharmacyQueueQuerySchema = z.object({
  status: z.enum(['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED']).optional(),
});

export const rejectOrSuspendPharmacySchema = z.object({
  reason: z.string().min(1, 'A reason is required').max(2000),
});
