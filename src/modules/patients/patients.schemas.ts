import { z } from 'zod';

const isoDate = z
  .string()
  .refine((v) => !Number.isNaN(Date.parse(v)), 'Invalid date')
  .optional();

export const updatePatientProfileSchema = z.object({
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  dateOfBirth: isoDate,
  gender: z.string().max(50).optional(),
  phone: z.string().max(20).optional(),
  email: z.string().email().optional().or(z.literal('')),
  address: z.string().max(500).optional(),
  city: z.string().max(100).optional(),
  state: z.string().max(100).optional(),
  pin: z.string().max(12).optional(),
  preferredLanguage: z.string().max(50).optional(),
  emergencyContact: z.string().max(100).optional(),
  // Free-text allergy list — Phase 7 (diagnostics/reports) and Phase 5
  // (consultations) are where a structured clinical vocabulary would
  // matter; for the patient's own profile, free text is what the brief
  // asks for.
  allergies: z.array(z.string().min(1).max(100)).max(50).optional(),
  medicalHistory: z.string().max(5000).optional(),
  consentPreferences: z.record(z.string(), z.unknown()).optional(),
});

export const familyRelationSchema = z.enum(['PARENT', 'SPOUSE', 'CHILD', 'DEPENDENT', 'OTHER']);

export const createFamilyMemberSchema = z.object({
  name: z.string().min(1).max(100),
  relation: familyRelationSchema,
  dateOfBirth: isoDate,
  gender: z.string().max(50).optional(),
  mobile: z.string().max(20).optional(),
});

export const updateFamilyMemberSchema = createFamilyMemberSchema.partial();
