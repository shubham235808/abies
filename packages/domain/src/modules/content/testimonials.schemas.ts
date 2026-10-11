import { z } from 'zod';
import { translationLanguageSchema } from './languages';

// Shared by create/update — the photo itself is owned by the multipart
// route handlers (createTestimonial/updateTestimonial take a parsed
// UploadedImage alongside this), same split as Promotion's images.
const baseTestimonialFields = {
  authorName: z.string().min(1).max(120),
  authorRole: z.string().max(150).optional(),
  quote: z.string().min(1).max(2000),
  rating: z.number().int().min(1).max(5).optional(),
  priority: z.number().int().min(0).max(1000).default(0),
  active: z.boolean().default(true),
};

// Media-library references: the alternative to uploading a photo with the
// form, and the only way to attach a video. null clears the reference.
const mediaAssetRefs = {
  photoAssetId: z.string().min(1).nullable().optional(),
  videoAssetId: z.string().min(1).nullable().optional(),
};

export const createTestimonialSchema = z.object({ ...baseTestimonialFields, ...mediaAssetRefs });

export const updateTestimonialSchema = z.object({
  authorName: baseTestimonialFields.authorName.optional(),
  authorRole: baseTestimonialFields.authorRole,
  quote: baseTestimonialFields.quote.optional(),
  rating: baseTestimonialFields.rating,
  priority: baseTestimonialFields.priority.optional(),
  active: z.boolean().optional(),
  ...mediaAssetRefs,
});

// Photo, rating, ordering and publish state stay on the English testimonial;
// a translation only carries text. authorName defaults to the English row's
// (names are usually kept as-is) but can be transliterated.
export const upsertTestimonialTranslationSchema = z.object({
  language: translationLanguageSchema,
  authorName: baseTestimonialFields.authorName.optional(),
  authorRole: baseTestimonialFields.authorRole,
  quote: baseTestimonialFields.quote,
  active: z.boolean().default(true),
});
