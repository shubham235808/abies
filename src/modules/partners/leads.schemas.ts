import { z } from 'zod';

export const partnerLeadKindSchema = z.enum(['DOCTOR', 'CLINIC', 'LAB', 'PHARMACY', 'PANCHAKARMA_CENTRE', 'CORPORATE']);
export const partnerLeadStageSchema = z.enum(['LEAD', 'QUALIFIED', 'VERIFICATION', 'COMMERCIAL', 'ENABLEMENT', 'ACTIVATED', 'REJECTED']);

export const createLeadSchema = z.object({
  kind: partnerLeadKindSchema,
  source: z.string().max(200).optional(),
  contactName: z.string().min(1).max(200),
  contactPhone: z.string().min(6).max(20),
  contactEmail: z.string().email().optional(),
  city: z.string().max(120).optional(),
  notes: z.string().max(5000).optional(),
});

export const updateLeadSchema = z
  .object({
    stage: partnerLeadStageSchema.optional(),
    notes: z.string().max(5000).optional(),
    nextFollowUpAt: z.string().datetime().nullable().optional(),
  })
  .refine((v) => v.stage !== undefined || v.notes !== undefined || v.nextFollowUpAt !== undefined, {
    message: 'Provide at least one field to update',
  });
