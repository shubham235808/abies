import { z } from 'zod';
import { translationLanguageSchema } from './languages';

export const CONTENT_PAGE_SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Slugs that already have a hand-built public route which reads this
// ContentPage (with its own non-CMS fallback). Every other slug is served
// by the generic /pages/<slug> route.
export const DEDICATED_CONTENT_PAGE_PATHS: Readonly<Record<string, string>> = {
  'about-us': '/about',
  terms: '/terms',
  privacy: '/privacy',
};

// hasOwn, not a bare index: "constructor" etc. are valid slugs and would
// otherwise resolve to Object.prototype members.
export function dedicatedPathForContentPage(slug: string): string | undefined {
  return Object.hasOwn(DEDICATED_CONTENT_PAGE_PATHS, slug) ? DEDICATED_CONTENT_PAGE_PATHS[slug] : undefined;
}

export function publicPathForContentPage(slug: string): string {
  return dedicatedPathForContentPage(slug) ?? `/pages/${slug}`;
}

const baseContentPageFields = {
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(20000),
  active: z.boolean().default(true),
};

export const createContentPageSchema = z.object({
  slug: z
    .string()
    .min(1)
    .max(80)
    .regex(CONTENT_PAGE_SLUG_PATTERN, 'Slug must be lowercase letters, numbers and single hyphens (e.g. shipping-policy)'),
  ...baseContentPageFields,
});

// Slug is deliberately not editable after creation: nav links, SEO rows
// ("page:<slug>") and any externally shared URL all key off it.
export const updateContentPageSchema = z.object({
  title: baseContentPageFields.title.optional(),
  body: baseContentPageFields.body.optional(),
  active: z.boolean().optional(),
});

// Keyed by the English page; the translation shares its slug, so it is
// served at the same URL.
export const upsertContentPageTranslationSchema = z.object({
  language: translationLanguageSchema,
  title: baseContentPageFields.title,
  body: baseContentPageFields.body,
  active: z.boolean().default(true),
});
