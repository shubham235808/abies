import { z } from 'zod';

export const addInventorySchema = z.object({
  // Set medicineId to add a batch of an existing catalogue entry (e.g. one
  // resolved from a prescription, or one another pharmacy already
  // stocks); omit it and set these descriptive fields to create a new
  // Medicine row first (find-or-create by name, same as
  // resolveMedicineByName — a pharmacist adding an OTC item pharmacies
  // haven't seen before).
  medicineId: z.string().optional(),
  name: z.string().min(1).max(200).optional(),
  genericName: z.string().max(200).optional(),
  form: z.string().max(100).optional(),
  strength: z.string().max(100).optional(),
  manufacturerName: z.string().max(200).optional(),
  brandName: z.string().max(200).optional(),
  requiresPrescription: z.boolean().optional(),
  // ENTERPRISE-7 — needed to sell this medicine at the POS counter
  // (GstRateConfig is looked up by hsnCode). Optional here since not every
  // pharmacy uses the POS; a sale attempt without one fails with a clear
  // message rather than guessing a rate.
  category: z.string().max(100).optional(),
  hsnCode: z.string().max(20).optional(),
  batchNumber: z.string().min(1).max(100),
  expiryDate: z.string().datetime(),
  quantityAvailable: z.number().int().min(0).max(1_000_000),
  price: z.number().int().min(0).max(1_000_000),
});

export const updateInventorySchema = z.object({
  quantityAvailable: z.number().int().min(0).max(1_000_000).optional(),
  price: z.number().int().min(0).max(1_000_000).optional(),
  expiryDate: z.string().datetime().optional(),
});

export const publicMedicineSearchSchema = z.object({
  q: z.string().optional(),
  area: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});
