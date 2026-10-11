'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import {
  CONTENT_LANGUAGE_COOKIE,
  CONTENT_LANGUAGE_LABELS,
  CONTENT_LANGUAGES,
  parseContentLanguage,
  type ContentLanguage,
} from '@abies/domain/modules/content/languages';

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

// Pages read the cookie server-side on every request, so a refresh is all
// it takes to re-render the CMS content in the new language — no client
// state or full reload.
export function LanguageSwitcher({ current }: { current: ContentLanguage }) {
  const router = useRouter();
  const [language, setLanguage] = useState(current);
  const [pending, startTransition] = useTransition();

  function choose(value: string) {
    const next = parseContentLanguage(value);
    setLanguage(next);
    const secure = window.location.protocol === 'https:' ? '; secure' : '';
    document.cookie = `${CONTENT_LANGUAGE_COOKIE}=${next}; path=/; max-age=${ONE_YEAR_SECONDS}; samesite=lax${secure}`;
    startTransition(() => router.refresh());
  }

  return (
    <label className="flex items-center gap-1.5">
      <span className="sr-only">Content language</span>
      <select
        value={language}
        onChange={(e) => choose(e.target.value)}
        disabled={pending}
        className="rounded-control border border-white/30 bg-white/10 px-1.5 py-0.5 text-xs text-white"
      >
        {CONTENT_LANGUAGES.map((l) => (
          <option key={l} value={l} lang={l} className="text-brand-neutral-900">
            {CONTENT_LANGUAGE_LABELS[l]}
          </option>
        ))}
      </select>
    </label>
  );
}
