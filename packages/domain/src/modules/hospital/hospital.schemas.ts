import { z } from 'zod';

export const createFacilitySchema = z.object({
  name: z.string().min(1).max(200),
  addressLine1: z.string().min(1).max(200),
  addressLine2: z.string().max(200).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  postalCode: z.string().min(1).max(20),
});

export const updateFacilitySchema = z.object({
  name: z.string().min(1).max(200).optional(),
  addressLine1: z.string().min(1).max(200).optional(),
  addressLine2: z.string().max(200).optional(),
  city: z.string().min(1).max(100).optional(),
  state: z.string().min(1).max(100).optional(),
  postalCode: z.string().min(1).max(20).optional(),
  active: z.boolean().optional(),
});

export const createWardSchema = z.object({
  name: z.string().min(1).max(200),
  wardType: z.string().min(1).max(100),
});

export const updateWardSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  wardType: z.string().min(1).max(100).optional(),
  active: z.boolean().optional(),
});

export const createBedSchema = z.object({
  label: z.string().min(1).max(50),
});

export const updateBedSchema = z.object({
  // AVAILABLE/OCCUPIED is system-managed by admit/transfer/discharge — this
  // is only for an admin taking a bed in or out of MAINTENANCE.
  status: z.enum(['AVAILABLE', 'MAINTENANCE']).optional(),
});

export const admitPatientSchema = z.object({
  patientMobile: z.string().min(10).max(15),
  admittingDoctorProfileId: z.string().min(1),
  bedId: z.string().min(1),
  reason: z.string().min(1).max(1000),
});

export const transferBedSchema = z.object({
  toBedId: z.string().min(1),
  reason: z.string().max(1000).optional(),
});

export const addRoundNoteSchema = z.object({
  note: z.string().min(1).max(5000),
});

export const composeDischargeSummarySchema = z.object({
  summary: z.string().min(1).max(10000),
  followUpInstructions: z.string().max(5000).optional(),
});
