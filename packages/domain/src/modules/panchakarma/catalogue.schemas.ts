import { z } from 'zod';

export const createTherapySchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  durationMinutes: z.number().int().min(1).max(1440).optional(),
  prerequisites: z.string().max(2000).optional(),
  contraindications: z.string().max(2000).optional(),
  price: z.number().int().min(0).max(1_000_000),
  requiredSupervision: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const updateTherapySchema = createTherapySchema.partial();

export const createTherapistSchema = z.object({
  name: z.string().min(1).max(200),
  qualifications: z.string().max(500).optional(),
  languages: z.array(z.string().min(1).max(40)).optional(),
});

export const updateTherapistSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  qualifications: z.string().max(500).optional(),
  languages: z.array(z.string().min(1).max(40)).optional(),
  active: z.boolean().optional(),
});

export const therapistDocumentTypeSchema = z.enum(['ID_PROOF', 'QUALIFICATION_CERTIFICATE', 'PROFILE_PHOTO', 'OTHER']);

export const therapistDocumentReviewSchema = z.object({
  outcome: z.enum(['VERIFY', 'REJECT', 'REQUEST_RESUBMISSION']),
  note: z.string().max(2000).optional(),
});

export const publicTherapySearchSchema = z.object({
  q: z.string().optional(),
  city: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
