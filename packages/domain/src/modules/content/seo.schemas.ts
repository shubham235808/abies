import { z } from 'zod';
import { isValidSeoPageKey } from './seo.pages';

const baseSeoFields = {
  title: z.string().min(1).max(120),
  description: z.string().min(1).max(320),
  keywords: z.array(z.string().min(1).max(60)).max(20).default([]),
  active: z.boolean().default(true),
};

// The OG image is owned by the multipart route handlers, same split as
// Testimonial's photo and Promotion's images.
export const createPageSeoSchema = z.object({
  pageKey: z.string().refine(isValidSeoPageKey, { message: 'Unknown page' }),
  ...baseSeoFields,
});

// pageKey is the row's identity (unique), so it isn't editable — resetting
// a page means deleting its row.
export const updatePageSeoSchema = z.object({
  title: baseSeoFields.title.optional(),
  description: baseSeoFields.description.optional(),
  keywords: baseSeoFields.keywords.optional(),
  active: z.boolean().optional(),
  clearOgImage: z.boolean().optional(),
});
