import { z } from 'zod';

// PATIENT is the only role that may appear here for pure self-registration;
// other roles are still accepted so the same endpoint serves doctor
// self-onboarding and admin/staff login — auth.service enforces who's
// actually allowed to provision each role (docs/DECISIONS.md D3).
// Sign in with either the mobile number or the email on the account (never
// both). The OTP challenge is still keyed on the account's mobile either way.
export const requestOtpSchema = z
  .object({
    mobile: z.string().min(1).optional(),
    email: z.string().trim().email('Enter a valid email address').optional(),
    role: z.enum(['PATIENT', 'DOCTOR', 'ADMIN', 'LAB', 'PHARMACY', 'PANCHAKARMA_CENTRE', 'CUSTOMER_SUPPORT', 'TECH_SUPPORT', 'SALES', 'CARE_COORDINATOR']),
  })
  .refine((d) => Boolean(d.mobile) !== Boolean(d.email), { message: 'Enter either a mobile number or an email' });

export const verifyOtpSchema = z.object({
  requestId: z.string().min(1),
  otp: z.string().min(4).max(8),
  acceptedTerms: z.boolean(),
});

export const verifyMfaSchema = z.object({
  code: z.string().min(4).max(10),
});
