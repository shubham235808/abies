import { z } from 'zod';

export const createTestSchema = z.object({
  code: z.string().min(1).max(50),
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  sampleType: z.string().max(100).optional(),
  preparationInstructions: z.string().max(2000).optional(),
  price: z.number().int().min(0).max(1_000_000),
  turnaroundHours: z.number().int().min(1).max(720).optional(),
  active: z.boolean().optional(),
});

export const updateTestSchema = createTestSchema.partial();

export const createPackageSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  price: z.number().int().min(0).max(1_000_000),
  testIds: z.array(z.string().min(1)).min(1).max(30),
  active: z.boolean().optional(),
});

export const updatePackageSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  price: z.number().int().min(0).max(1_000_000).optional(),
  testIds: z.array(z.string().min(1)).min(1).max(30).optional(),
  active: z.boolean().optional(),
});

export const publicTestSearchSchema = z.object({
  q: z.string().optional(),
  city: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
