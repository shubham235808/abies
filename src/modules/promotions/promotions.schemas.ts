import { z } from 'zod';

const PLACEMENTS = [
  'PUBLIC_HOME_HERO',
  'PUBLIC_HOME_SERVICES',
  'PATIENT_HOME_HERO',
  'PATIENT_HOME_DOCTORS',
  'PATIENT_HOME_DIAGNOSTICS',
  'PATIENT_HOME_MEDICINES',
  'PATIENT_HOME_PANCHAKARMA',
] as const;

const ENTITY_TYPES = ['DOCTOR', 'PANCHAKARMA_CENTRE', 'DIAGNOSTIC_LAB', 'DIAGNOSTIC_TEST', 'MEDICINE', 'CAMPAIGN'] as const;

export const promotionPlacementSchema = z.enum(PLACEMENTS);
export const promotionEntityTypeSchema = z.enum(ENTITY_TYPES);

// Shared by create/update — everything except the images, which the
// multipart route handlers own separately (createPromotion/updatePromotion
// take a parsed UploadedFile alongside this).
const basePromotionFields = {
  title: z.string().min(1).max(200),
  subtitle: z.string().max(300).optional(),
  description: z.string().max(2000).optional(),
  ctaLabel: z.string().max(60).optional(),
  ctaHref: z.string().max(500).optional(),
  placement: promotionPlacementSchema,
  entityType: promotionEntityTypeSchema.optional(),
  entityId: z.string().optional(),
  startAt: z.string().datetime(),
  endAt: z.string().datetime(),
  priority: z.number().int().min(0).max(1000).default(0),
  targetLocations: z.array(z.string().min(1)).default([]),
  targetLanguages: z.array(z.string().min(1)).default([]),
  active: z.boolean().default(true),
};

export const createPromotionSchema = z
  .object(basePromotionFields)
  .refine((v) => new Date(v.endAt).getTime() > new Date(v.startAt).getTime(), {
    message: 'End date must be after the start date',
    path: ['endAt'],
  })
  .refine((v) => Boolean(v.entityType) === Boolean(v.entityId), {
    message: 'entityType and entityId must be provided together',
    path: ['entityId'],
  });

export const updatePromotionSchema = z
  .object({
    title: basePromotionFields.title.optional(),
    subtitle: basePromotionFields.subtitle,
    description: basePromotionFields.description,
    ctaLabel: basePromotionFields.ctaLabel,
    ctaHref: basePromotionFields.ctaHref,
    placement: promotionPlacementSchema.optional(),
    entityType: promotionEntityTypeSchema.optional(),
    entityId: z.string().optional(),
    startAt: z.string().datetime().optional(),
    endAt: z.string().datetime().optional(),
    priority: z.number().int().min(0).max(1000).optional(),
    targetLocations: z.array(z.string().min(1)).optional(),
    targetLanguages: z.array(z.string().min(1)).optional(),
    active: z.boolean().optional(),
  })
  .refine((v) => !(v.startAt && v.endAt) || new Date(v.endAt).getTime() > new Date(v.startAt).getTime(), {
    message: 'End date must be after the start date',
    path: ['endAt'],
  });
