import { z } from 'zod';

// Languages an admin can publish CMS content in. Same pair the notification
// templates already carry bodies for (TEMPLATE_LANGUAGES in
// modules/notifications/templates.ts). This governs admin-managed content
// only (pages, FAQ, testimonials, nav labels, SEO) — the site's own UI text
// is not translated.
export const CONTENT_LANGUAGES = ['en', 'hi'] as const;
export type ContentLanguage = (typeof CONTENT_LANGUAGES)[number];

export const DEFAULT_CONTENT_LANGUAGE = 'en' satisfies ContentLanguage;

export type TranslationLanguage = Exclude<ContentLanguage, typeof DEFAULT_CONTENT_LANGUAGE>;
export const TRANSLATION_LANGUAGES = CONTENT_LANGUAGES.filter(
  (l): l is TranslationLanguage => l !== DEFAULT_CONTENT_LANGUAGE,
);

// Each language named in itself, so a visitor who can't read English can
// still find their own language in the switcher.
export const CONTENT_LANGUAGE_LABELS: Record<ContentLanguage, string> = {
  en: 'English',
  hi: 'हिन्दी',
};

export const translationLanguageSchema = z.enum(TRANSLATION_LANGUAGES as [TranslationLanguage, ...TranslationLanguage[]]);

export const CONTENT_LANGUAGE_COOKIE = 'abies_content_lang';

export function parseContentLanguage(value: string | null | undefined): ContentLanguage {
  return (CONTENT_LANGUAGES as readonly string[]).includes(value ?? '') ? (value as ContentLanguage) : DEFAULT_CONTENT_LANGUAGE;
}

// The per-item fallback rule every public CMS resolver uses: the requested
// language's translation if one exists and is published, otherwise the
// English row itself — never nothing.
export function localise<T extends { language: string; active: boolean }>(
  base: T,
  translations: readonly T[],
  language: ContentLanguage,
): T {
  if (language === base.language) return base;
  return translations.find((t) => t.language === language && t.active) ?? base;
}
