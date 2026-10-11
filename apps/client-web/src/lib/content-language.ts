import { cookies } from 'next/headers';
import {
  CONTENT_LANGUAGE_COOKIE,
  parseContentLanguage,
  type ContentLanguage,
} from '@abies/domain/modules/content/languages';

// The language a visitor picked for admin-managed content (LanguageSwitcher
// sets the cookie). A cookie rather than a [locale] route segment because
// only CMS content is translated — the site's own UI text and URLs are
// English-only, so per-language URLs would have nothing to separate.
export async function currentContentLanguage(): Promise<ContentLanguage> {
  const store = await cookies();
  return parseContentLanguage(store.get(CONTENT_LANGUAGE_COOKIE)?.value);
}
