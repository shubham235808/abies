import { z } from 'zod';

export const bookOrderSchema = z.object({
  pharmacyId: z.string().min(1),
  prescriptionId: z.string().optional(),
  careRecipientFamilyMemberId: z.string().optional(),
  deliveryAddress: z.string().min(1).max(500),
  items: z
    .array(
      z.object({
        medicineId: z.string().min(1),
        // EXPANSION-1 — omitted for a plain, non-variant product; required
        // in effect once a medicine has variants, since bookOrder refuses
        // to guess which pack size was meant.
        variantId: z.string().optional(),
        quantity: z.number().int().min(1).max(1000),
      }),
    )
    .min(1)
    .max(20),
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

export const dispatchOrderSchema = z.object({
  carrier: z.string().min(1).max(100).optional(),
  trackingRef: z.string().min(1).max(100).optional(),
});
