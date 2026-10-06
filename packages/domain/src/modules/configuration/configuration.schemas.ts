import { z } from 'zod';

export const configCategorySchema = z.object({
  domain: z.string().min(1).max(60),
  key: z.string().min(1).max(60),
  label: z.string().min(1).max(120),
  sortOrder: z.number().int().optional(),
});
export const updateConfigCategorySchema = z.object({
  label: z.string().min(1).max(120).optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});

export const serviceLocationSchema = z.object({
  city: z.string().min(1).max(80),
  state: z.string().min(1).max(80),
  pinCodes: z.array(z.string().min(4).max(10)).default([]),
});
export const updateServiceLocationSchema = z.object({
  pinCodes: z.array(z.string().min(4).max(10)).optional(),
  active: z.boolean().optional(),
});

export const documentRequirementSchema = z.object({
  partnerType: z.string().min(1).max(40),
  documentType: z.string().min(1).max(60),
  required: z.boolean().optional(),
});
export const updateDocumentRequirementSchema = z.object({
  required: z.boolean().optional(),
  active: z.boolean().optional(),
});

export const courierProviderSchema = z.object({
  code: z.string().min(1).max(40),
  label: z.string().min(1).max(80),
});
export const updateCourierProviderSchema = z.object({
  label: z.string().min(1).max(80).optional(),
  active: z.boolean().optional(),
});

export const notificationTemplateSchema = z.object({
  templateKey: z.string().min(1).max(80),
  channel: z.enum(['EMAIL', 'WHATSAPP', 'IN_APP', 'PUSH']),
  subject: z.string().max(200).optional(),
  body: z.string().min(1).max(2000),
});
export const updateNotificationTemplateSchema = z.object({
  subject: z.string().max(200).optional(),
  body: z.string().min(1).max(2000).optional(),
  active: z.boolean().optional(),
});

// ENTERPRISE-7 — admin-configurable GST rate table (backs the Pharmacy
// POS). Indian GST slabs are always whole-number percentages (0/5/12/18/28).
export const gstRateConfigSchema = z.object({
  hsnCode: z.string().min(1).max(20),
  label: z.string().min(1).max(120),
  ratePercent: z.number().int().min(0).max(100),
});
export const updateGstRateConfigSchema = z.object({
  label: z.string().min(1).max(120).optional(),
  ratePercent: z.number().int().min(0).max(100).optional(),
  active: z.boolean().optional(),
});
