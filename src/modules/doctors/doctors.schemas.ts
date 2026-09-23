import { z } from 'zod';

export const consultationModeSchema = z.enum(['VIDEO', 'CLINIC']);
export const doctorDocumentTypeSchema = z.enum([
  'REGISTRATION_CERTIFICATE',
  'DEGREE_CERTIFICATE',
  'ID_PROOF',
  'PROFILE_PHOTO',
  'OTHER',
]);

export const updateDoctorProfileSchema = z.object({
  title: z.string().max(20).optional(),
  firstName: z.string().min(1).max(100).optional(),
  lastName: z.string().min(1).max(100).optional(),
  gender: z.string().max(50).optional(),
  bio: z.string().max(3000).optional(),
  registrationCouncil: z.string().min(1).max(200).optional(),
  registrationNumber: z.string().min(1).max(100).optional(),
  registrationYear: z.number().int().min(1950).max(2100).optional(),
  primaryQualification: z.string().min(1).max(200).optional(),
  highestQualification: z.string().max(200).optional(),
  graduationInstitution: z.string().max(200).optional(),
  graduationYear: z.number().int().min(1950).max(2100).optional(),
  yearsExperience: z.number().int().min(0).max(80).optional(),
  specialties: z.array(z.string().min(1).max(100)).max(20).optional(),
  languages: z.array(z.string().min(1).max(50)).max(20).optional(),
  consultationModes: z.array(consultationModeSchema).min(0).max(2).optional(),
  videoFee: z.number().int().min(0).max(1_000_000).optional(),
  clinicFee: z.number().int().min(0).max(1_000_000).optional(),
  isAcceptingNewPatients: z.boolean().optional(),
});

export const createClinicSchema = z.object({
  name: z.string().min(1).max(200),
  addressLine1: z.string().min(1).max(300),
  addressLine2: z.string().max(300).optional(),
  city: z.string().min(1).max(100),
  state: z.string().min(1).max(100),
  postalCode: z.string().min(1).max(12),
  phone: z.string().max(20).optional(),
  latitude: z.number().min(-90).max(90).optional(),
  longitude: z.number().min(-180).max(180).optional(),
  active: z.boolean().optional(),
});

export const updateClinicSchema = createClinicSchema.partial();

export const createAvailabilitySchema = z.object({
  dayOfWeek: z.number().int().min(0).max(6),
  startTime: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM 24-hour time'),
  endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'Expected HH:MM 24-hour time'),
  slotMinutes: z.number().int().min(5).max(240).optional(),
  mode: consultationModeSchema,
  // No clinicId here: DoctorAvailability has no such column (ported as-is
  // from the validated Sprint 3 schema, docs/DECISIONS.md D3, which also
  // didn't link a slot to a specific clinic). A doctor with multiple
  // clinics can't yet say which one a CLINIC-mode slot is at — tracked as
  // a follow-up for whichever phase adds appointment-slot generation,
  // where it actually matters. Do not add this field back without a
  // matching Prisma migration.
  active: z.boolean().optional(),
});

export const updateAvailabilitySchema = createAvailabilitySchema.partial();

export const submitApplicationSchema = z.object({
  declarationAccepted: z.boolean(),
});

export const publicDoctorSearchSchema = z.object({
  q: z.string().optional(),
  city: z.string().optional(),
  specialty: z.string().optional(),
  language: z.string().optional(),
  mode: consultationModeSchema.optional(),
  accepting: z.enum(['true', 'false']).optional(),
  limit: z.coerce.number().int().min(1).max(50).optional(),
  offset: z.coerce.number().int().min(0).optional(),
});

export const adminDoctorQueueQuerySchema = z.object({
  status: z.enum(['DRAFT', 'SUBMITTED', 'UNDER_REVIEW', 'APPROVED', 'REJECTED', 'SUSPENDED']).optional(),
});

export const documentReviewSchema = z.object({
  verified: z.boolean(),
  note: z.string().max(2000).optional(),
});

export const verificationActionSchema = z.object({
  notes: z.string().max(2000).optional(),
});

export const rejectOrSuspendSchema = z.object({
  reason: z.string().min(1, 'A reason is required').max(2000),
});
