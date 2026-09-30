import { z } from 'zod';

export const addToCartSchema = z.object({
  pharmacyId: z.string().min(1),
  medicineId: z.string().min(1),
  variantId: z.string().optional(),
  quantity: z.number().int().min(1).max(1000).default(1),
});

export const updateCartItemSchema = z.object({
  quantity: z.number().int().min(0).max(1000), // 0 removes the item
});

export const checkoutCartSchema = z.object({
  deliveryAddress: z.string().min(1).max(500),
  careRecipientFamilyMemberId: z.string().optional(),
});
