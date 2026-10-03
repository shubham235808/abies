import { z } from 'zod';

// ENTERPRISE-6 — testIds and packageId are mutually exclusive: a booking
// is either a set of individual tests or one bundled package, never both
// in the same order (a package's own price already covers its tests).
export const bookOrderSchema = z
  .object({
    labId: z.string().min(1),
    testIds: z.array(z.string().min(1)).min(1).max(10).optional(),
    packageId: z.string().min(1).optional(),
    recommendationId: z.string().optional(),
    collectionMode: z.enum(['HOME', 'LAB_VISIT']),
    scheduledAt: z.string().datetime(),
    address: z.string().max(500).optional(),
  })
  .refine((v) => Boolean(v.testIds?.length) !== Boolean(v.packageId), {
    message: 'Provide either testIds or packageId, not both',
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
