import { z } from 'zod';

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

export const createTestimonialSchema = z.object(baseTestimonialFields);

export const updateTestimonialSchema = z.object({
  authorName: baseTestimonialFields.authorName.optional(),
  authorRole: baseTestimonialFields.authorRole,
  quote: baseTestimonialFields.quote.optional(),
  rating: baseTestimonialFields.rating,
  priority: baseTestimonialFields.priority.optional(),
  active: z.boolean().optional(),
});
