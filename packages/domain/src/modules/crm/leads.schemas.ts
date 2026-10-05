import { z } from 'zod';

export const LEAD_SOURCES = [
  'WEBSITE',
  'MOBILE_APP',
  'INSTAGRAM',
  'FACEBOOK',
  'GOOGLE',
  'WHATSAPP',
  'PHONE',
  'WALK_IN',
  'DOCTOR_REFERRAL',
  'PATIENT_REFERRAL',
  'CAMPAIGN',
  'PANCHAKARMA_ENQUIRY',
  'DIAGNOSTICS_ENQUIRY',
  'PRODUCT_ENQUIRY',
  'PHARMACY_ENQUIRY',
  'MANUAL',
  'OTHER',
] as const;

export const LEAD_STAGES = [
  'NEW',
  'CONTACTED',
  'QUALIFIED',
  'PROPOSAL',
  'FOLLOW_UP',
  'CONVERTED',
  'LOST',
  'DUPLICATE',
  'INVALID',
  'DO_NOT_CONTACT',
] as const;

export const LEAD_PRIORITIES = ['LOW', 'MEDIUM', 'HIGH'] as const;

export const ACTIVITY_TYPES = ['NOTE', 'CALL', 'WHATSAPP', 'SMS', 'EMAIL', 'MEETING'] as const;

const optionalText = (max: number) => z.string().trim().max(max).optional().transform((v) => (v ? v : undefined));

// Indian mobile numbers, same rule as auth.service's normalizeMobile.
const mobileField = z
  .string()
  .trim()
  .optional()
  .transform((v) => (v ? v.replace(/\D/g, '') : undefined))
  .refine((v) => v === undefined || /^(91)?[6-9]\d{9}$/.test(v), 'Enter a valid 10-digit mobile number')
  .transform((v) => (v ? `+91${v.slice(-10)}` : undefined));

const emailField = z
  .string()
  .trim()
  .toLowerCase()
  .email('Enter a valid email address')
  .optional()
  .or(z.literal('').transform(() => undefined));

export const createLeadSchema = z
  .object({
    firstName: z.string().trim().min(1, 'Enter the first name').max(80),
    lastName: optionalText(80),
    mobile: mobileField,
    email: emailField,
    city: optionalText(80),
    state: optionalText(80),
    pinCode: z
      .string()
      .trim()
      .regex(/^\d{6}$/, 'PIN code must be 6 digits')
      .optional()
      .or(z.literal('').transform(() => undefined)),
    preferredLanguage: optionalText(40),
    source: z.enum(LEAD_SOURCES),
    campaign: optionalText(120),
    interestedService: optionalText(120),
    priority: z.enum(LEAD_PRIORITIES).default('MEDIUM'),
    assignedToId: z.string().min(1).optional(),
    tags: z.array(z.string().trim().min(1).max(40)).max(20).optional(),
  })
  .refine((d) => Boolean(d.mobile || d.email), { message: 'Enter a mobile number or an email' });
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const updateLeadSchema = z.object({
  firstName: z.string().trim().min(1).max(80).optional(),
  lastName: optionalText(80),
  city: optionalText(80),
  state: optionalText(80),
  preferredLanguage: optionalText(40),
  campaign: optionalText(120),
  interestedService: optionalText(120),
  priority: z.enum(LEAD_PRIORITIES).optional(),
  nextFollowUpAt: z.string().datetime().nullable().optional(),
});
export type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

export const changeStageSchema = z.object({
  stage: z.enum(LEAD_STAGES),
  reason: optionalText(300),
});

export const assignLeadSchema = z.object({
  assignedToId: z.string().min(1).nullable(),
  reason: optionalText(300),
});

export const addActivitySchema = z.object({
  type: z.enum(ACTIVITY_TYPES),
  summary: z.string().trim().min(1, 'Enter a note').max(2000),
});

export const listLeadsSchema = z.object({
  q: optionalText(120),
  stage: z.enum(LEAD_STAGES).optional(),
  source: z.enum(LEAD_SOURCES).optional(),
  assignedToId: z.string().optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(25),
});

export type AddActivityInput = z.infer<typeof addActivitySchema>;
export type ListLeadsInput = z.infer<typeof listLeadsSchema>;
