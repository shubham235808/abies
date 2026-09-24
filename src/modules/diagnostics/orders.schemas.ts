import { z } from 'zod';

export const bookOrderSchema = z.object({
  labId: z.string().min(1),
  testIds: z.array(z.string().min(1)).min(1).max(10),
  recommendationId: z.string().optional(),
  collectionMode: z.enum(['HOME', 'LAB_VISIT']),
  scheduledAt: z.string().datetime(),
  address: z.string().max(500).optional(),
});

export const verifyOrderPaymentSchema = z.object({
  orderId: z.string().min(1),
  razorpayOrderId: z.string().min(1),
  razorpayPaymentId: z.string().min(1),
  razorpaySignature: z.string().min(1),
});

export const cancelOrderSchema = z.object({
  reason: z.string().max(500).optional(),
});

export const sampleCollectedSchema = z.object({
  collectorName: z.string().max(200).optional(),
  sampleBarcode: z.string().max(100).optional(),
  qualityException: z.string().max(1000).optional(),
});

export const releaseReportSchema = z.object({
  structuredResults: z.record(z.string(), z.unknown()).optional(),
  criticalFlag: z.boolean().optional(),
});
