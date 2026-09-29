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

// ENTERPRISE-7 — a pharmacy's own GST registration profile.
export const taxSettingsSchema = z.object({
  legalBusinessName: z.string().min(1).max(200),
  gstin: z
    .string()
    .regex(/^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z][1-9A-Z][Z][0-9A-Z]$/, 'Enter a valid 15-character GSTIN'),
  registeredState: z.string().min(1).max(80),
  stateCode: z.string().min(1).max(4),
  invoicePrefix: z
    .string()
    .min(1)
    .max(12)
    .regex(/^[A-Z0-9-]+$/, 'Use only uppercase letters, numbers, and hyphens'),
});

export const posSaleItemSchema = z.object({
  medicineId: z.string().min(1),
  batchNumber: z.string().min(1),
  quantity: z.number().int().min(1).max(1000),
});

export const posSaleSchema = z.object({
  customerName: z.string().max(200).optional(),
  customerPhone: z.string().max(20).optional(),
  paymentMethod: z.enum(['CASH', 'UPI', 'CARD', 'RAZORPAY', 'OTHER']),
  upiReference: z.string().max(100).optional(),
  discountAmount: z.number().int().min(0).default(0),
  items: z.array(posSaleItemSchema).min(1).max(50),
});
