import { z } from 'zod';
import { CONTENT_PAGE_SLUG_PATTERN } from './pages.schemas';

export const BLOG_POST_SLUG_PATTERN = CONTENT_PAGE_SLUG_PATTERN;

export function publicPathForBlogPost(slug: string): string {
  return `/blog/${slug}`;
}

// Shared by create/update — the cover image itself is owned by the multipart
// route handlers, same split as Testimonial photos. publishedAt arrives as
// an ISO string inside the JSON payload; null means draft.
const baseBlogPostFields = {
  title: z.string().min(1).max(200),
  excerpt: z.string().min(1).max(500),
  body: z.string().min(1).max(50000),
  authorName: z.string().min(1).max(120),
  publishedAt: z.coerce.date().nullable().default(null),
  active: z.boolean().default(true),
};

export const createBlogPostSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(BLOG_POST_SLUG_PATTERN, 'Slug must be lowercase letters, numbers and single hyphens (e.g. ayurveda-for-sleep)'),
  ...baseBlogPostFields,
});

// Slug is fixed after creation, same as ContentPage: it's the public URL,
// and anything already shared or indexed points at it.
export const updateBlogPostSchema = z.object({
  title: baseBlogPostFields.title.optional(),
  excerpt: baseBlogPostFields.excerpt.optional(),
  body: baseBlogPostFields.body.optional(),
  authorName: baseBlogPostFields.authorName.optional(),
  publishedAt: z.coerce.date().nullable().optional(),
  active: z.boolean().optional(),
  clearCoverImage: z.boolean().optional(),
});
