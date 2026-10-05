import { z } from 'zod';

export const staffRoleSchema = z.enum(['CUSTOMER_SUPPORT', 'TECH_SUPPORT', 'SALES', 'CARE_COORDINATOR']);

// Partner roles are provisioned by an ops admin too (access is granted from the
// ops portal, not by self-onboarding). They carry no staff profile.
export const partnerRoleSchema = z.enum(['DOCTOR', 'LAB', 'PHARMACY', 'PANCHAKARMA_CENTRE']);

export const provisionableRoleSchema = z.enum([...staffRoleSchema.options, ...partnerRoleSchema.options] as const);

export const createStaffAccountSchema = z.object({
  name: z.string().trim().min(2, 'Enter the person\'s full name').max(120),
  mobile: z.string().min(10).max(15),
  role: provisionableRoleSchema,
  title: z.string().max(120).optional(),
});
