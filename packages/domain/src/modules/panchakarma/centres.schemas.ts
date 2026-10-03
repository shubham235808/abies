import { z } from 'zod';

export const updateCentreProfileSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  addressLine1: z.string().min(1).max(300).optional(),
  city: z.string().min(1).max(100).optional(),
  state: z.string().min(1).max(100).optional(),
  postalCode: z.string().min(1).max(20).optional(),
  supervisingPractitioner: z.string().min(1).max(200).optional(),
  licenseNumbers: z.array(z.string().min(1).max(100)).max(20).optional(),
});

export const submitCentreApplicationSchema = z.object({
  declarationAccepted: z.boolean(),
});

export const adminCentreQueueQuerySchema = z.object({
  status: z.enum(['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED']).optional(),
});

export const rejectOrSuspendCentreSchema = z.object({
  reason: z.string().min(1, 'A reason is required').max(2000),
});
