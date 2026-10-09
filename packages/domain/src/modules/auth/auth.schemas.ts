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
  // Required by the server only when this sign-in creates the account.
  name: z.string().trim().max(120).optional(),
});

export const verifyMfaSchema = z.object({
  code: z.string().min(4).max(10),
});

// Password-auth backend (docs/password-auth-backend.md). Sign in with
// either the mobile number or the email on the account — same convention
// as requestOtpSchema above, never both.
export const loginSchema = z
  .object({
    mobile: z.string().min(1).optional(),
    email: z.string().trim().email('Enter a valid email address').optional(),
    password: z.string().min(1, 'Enter your password'),
  })
  .refine((d) => Boolean(d.mobile) !== Boolean(d.email), { message: 'Enter either a mobile number or an email' });

export const requestPasswordResetSchema = z
  .object({
    mobile: z.string().min(1).optional(),
    email: z.string().trim().email('Enter a valid email address').optional(),
  })
  .refine((d) => Boolean(d.mobile) !== Boolean(d.email), { message: 'Enter either a mobile number or an email' });

// 12-char minimum, no uppercase/digit/symbol complexity rules — see the
// reasoning comment in lib/password.ts. The high max is only a sanity
// bound; passphrases with spaces are explicitly allowed (no regex at all).
const newPasswordField = z
  .string()
  .min(12, 'Password must be at least 12 characters')
  .max(256, 'Password is too long');

export const completePasswordSetupSchema = z.object({
  requestId: z.string().min(1),
  otp: z.string().min(4).max(8),
  newPassword: newPasswordField,
});

export const resetPasswordSchema = z.object({
  requestId: z.string().min(1),
  otp: z.string().min(4).max(8),
  newPassword: newPasswordField,
});
