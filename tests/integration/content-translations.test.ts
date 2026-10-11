import { randomInt } from 'crypto';
// The workspace root has no react of its own; this is the same copy the
// client-web components below render with (hooks need a single instance).
import { createElement } from '../../apps/client-web/node_modules/react';
import { afterAll, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { prisma } from '@abies/domain/lib/db';
import { NotFoundError } from '@abies/domain/lib/errors';
import { upsertFaqTranslationSchema } from '@abies/domain/modules/content/faq.schemas';
import {
  activeFaqEntries,
  createFaqEntry,
  listFaqEntries,
  removeFaqEntry,
  removeFaqTranslation,
  updateFaqEntry,
  upsertFaqTranslation,
} from '@abies/domain/modules/content/faq.service';
import { CONTENT_LANGUAGE_COOKIE, localise, parseContentLanguage } from '@abies/domain/modules/content/languages';
import {
  activeNavMenus,
  createNavMenuItem,
  removeNavMenuItem,
  resolveNavItems,
  upsertNavMenuItemTranslation,
} from '@abies/domain/modules/content/nav.service';
import {
  activeContentPageBySlug,
  createContentPage,
  getContentPage,
  removeContentPage,
  updateContentPage,
  upsertContentPageTranslation,
} from '@abies/domain/modules/content/pages.service';
import { createPageSeo, removePageSeo, resolvePageSeo, upsertPageSeoTranslation } from '@abies/domain/modules/content/seo.service';
import {
  activeTestimonials,
  createTestimonial,
  removeTestimonial,
  upsertTestimonialTranslation,
} from '@abies/domain/modules/content/testimonials.service';
import FaqPage from '../../apps/client-web/src/app/(public)/faq/page';
import { LanguageSwitcher } from '../../apps/client-web/src/components/layouts/language-switcher';

// Server Components read the language cookie through next/headers; here it
// reads the jsdom cookie jar, so whatever LanguageSwitcher writes is exactly
// what the next server render sees — the same round trip as in a browser.
// Mocked by client-web's own path because that's the copy of next its
// components import; a bare 'next/headers' would mock a different module.
vi.mock('../../apps/client-web/node_modules/next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => {
      const pair = document.cookie.split('; ').find((c) => c.startsWith(`${name}=`));
      return pair ? { name, value: pair.slice(name.length + 1) } : undefined;
    },
  }),
}));

const { refresh } = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock('../../apps/client-web/node_modules/next/navigation', () => ({ useRouter: () => ({ refresh }) }));

const n = randomInt(100000, 999999);
const tag = `TEST_I18N_${n}`;
const createdFaqIds: string[] = [];
const createdPageIds: string[] = [];
const createdTestimonialIds: string[] = [];
const createdNavIds: string[] = [];
const createdSeoIds: string[] = [];

function clearLanguageCookie() {
  document.cookie = `${CONTENT_LANGUAGE_COOKIE}=; path=/; max-age=0`;
}

afterEach(() => {
  cleanup();
  clearLanguageCookie();
});

afterAll(async () => {
  for (const id of createdFaqIds) await removeFaqEntry(id, {}).catch(() => {});
  for (const id of createdNavIds) await removeNavMenuItem(id, {}).catch(() => {});
  for (const id of createdTestimonialIds) await removeTestimonial(id, {}).catch(() => {});
  for (const id of createdSeoIds) await removePageSeo(id, {}).catch(() => {});
  for (const id of createdPageIds) await removeContentPage(id, {}).catch(() => {});
  await prisma.$disconnect();
});

async function newFaq(suffix: string, priority: number) {
  const entry = await createFaqEntry({ question: `${tag} Q ${suffix}`, answer: `${tag} A ${suffix}`, priority, active: true }, {});
  createdFaqIds.push(entry.id);
  return entry;
}

describe('Content languages', () => {
  it('only accepts supported languages, defaulting anything else to English', () => {
    expect(parseContentLanguage('hi')).toBe('hi');
    expect(parseContentLanguage('fr')).toBe('en');
    expect(parseContentLanguage(undefined)).toBe('en');
    expect(upsertFaqTranslationSchema.safeParse({ language: 'en', question: 'q', answer: 'a' }).success).toBe(false);
    expect(upsertFaqTranslationSchema.safeParse({ language: 'hi', question: 'q', answer: 'a' }).success).toBe(true);
  });

  it('localise prefers a published translation and otherwise returns the English row', () => {
    const en = { language: 'en', active: true, text: 'Hello' };
    const hiDraft = { language: 'hi', active: false, text: 'नमस्ते' };
    expect(localise(en, [hiDraft], 'hi').text).toBe('Hello');
    expect(localise(en, [{ ...hiDraft, active: true }], 'hi').text).toBe('नमस्ते');
    expect(localise(en, [{ ...hiDraft, active: true }], 'en').text).toBe('Hello');
  });
});

describe('FAQ translations', () => {
  it('creates a Hindi translation linked to its English entry, updates it in place, and audits both', async () => {
    const source = await newFaq('create', 0);
    const created = await upsertFaqTranslation(source.id, { language: 'hi', question: 'प्रश्न', answer: 'उत्तर', active: true }, {});
    expect(created).toMatchObject({ language: 'hi', translationOfId: source.id, question: 'प्रश्न' });

    const updated = await upsertFaqTranslation(source.id, { language: 'hi', question: 'नया प्रश्न', answer: 'उत्तर', active: true }, {});
    expect(updated.id).toBe(created.id);
    expect(await prisma.faqEntry.count({ where: { translationOfId: source.id } })).toBe(1);

    // The admin list nests translations under the English entry rather than
    // listing them as entries of their own.
    const listed = (await listFaqEntries()).filter((e) => e.question.startsWith(tag));
    expect(listed.map((e) => e.id)).toContain(source.id);
    expect(listed.some((e) => e.id === created.id)).toBe(false);
    expect(listed.find((e) => e.id === source.id)?.translations.map((t) => t.question)).toEqual(['नया प्रश्न']);

    const actions = (await prisma.auditEvent.findMany({ where: { resourceId: created.id, resourceType: 'FaqEntry' } })).map((e) => e.action);
    expect(actions.sort()).toEqual(['CREATED', 'UPDATED']);
  });

  it('refuses to translate a translation or to edit one as if it were an English entry', async () => {
    const source = await newFaq('guard', 0);
    const translation = await upsertFaqTranslation(source.id, { language: 'hi', question: 'क', answer: 'ख', active: true }, {});
    await expect(upsertFaqTranslation(translation.id, { language: 'hi', question: 'x', answer: 'y', active: true }, {})).rejects.toThrow(
      NotFoundError,
    );
    await expect(updateFaqEntry(translation.id, { priority: 5 }, {})).rejects.toThrow(NotFoundError);
  });

  it('serves each entry in the requested language, falling back to English per entry and keeping English order', async () => {
    const first = await newFaq('first', 900);
    const second = await newFaq('second', 899);
    const third = await newFaq('third', 898);
    await upsertFaqTranslation(first.id, { language: 'hi', question: `${tag} प्रश्न एक`, answer: 'उत्तर एक', active: true }, {});
    // A draft translation is not served — the English text is.
    await upsertFaqTranslation(third.id, { language: 'hi', question: `${tag} मसौदा`, answer: 'मसौदा', active: false }, {});

    const hindi = (await activeFaqEntries('hi')).filter((e) => [first.id, second.id, third.id].includes(e.id));
    expect(hindi.map((e) => [e.question, e.language])).toEqual([
      [`${tag} प्रश्न एक`, 'hi'],
      [second.question, 'en'],
      [third.question, 'en'],
    ]);

    const english = (await activeFaqEntries('en')).filter((e) => [first.id, second.id, third.id].includes(e.id));
    expect(english.map((e) => e.question)).toEqual([first.question, second.question, third.question]);

    // Hiding the English entry hides it in every language.
    await updateFaqEntry(first.id, { active: false }, {});
    expect((await activeFaqEntries('hi')).some((e) => e.id === first.id)).toBe(false);

    await removeFaqTranslation(third.id, 'hi', {});
    expect(await prisma.faqEntry.count({ where: { translationOfId: third.id } })).toBe(0);
  });

  it('removes translations with their English entry', async () => {
    const source = await newFaq('cascade', 0);
    const translation = await upsertFaqTranslation(source.id, { language: 'hi', question: 'क', answer: 'ख', active: true }, {});
    await removeFaqEntry(source.id, {});
    createdFaqIds.splice(createdFaqIds.indexOf(source.id), 1);
    expect(await prisma.faqEntry.findUnique({ where: { id: translation.id } })).toBeNull();
  });
});

describe('Content page translations', () => {
  it('serves the translation at the same slug, falls back to English, and follows the English publish state', async () => {
    const page = await createContentPage({ slug: `test-i18n-${n}`, title: 'Shipping', body: 'English body', active: true }, {});
    createdPageIds.push(page.id);

    expect((await activeContentPageBySlug(page.slug, 'hi'))?.title).toBe('Shipping');

    const translation = await upsertContentPageTranslation(page.id, { language: 'hi', title: 'शिपिंग', body: 'हिन्दी पाठ', active: true }, {});
    expect(translation).toMatchObject({ slug: page.slug, language: 'hi', translationOfId: page.id });
    expect(await activeContentPageBySlug(page.slug, 'hi')).toMatchObject({ title: 'शिपिंग', language: 'hi' });
    expect(await activeContentPageBySlug(page.slug, 'en')).toMatchObject({ title: 'Shipping', language: 'en' });

    await updateContentPage(page.id, { active: false }, {});
    expect(await activeContentPageBySlug(page.slug, 'hi')).toBeNull();

    await removeContentPage(page.id, {});
    createdPageIds.splice(createdPageIds.indexOf(page.id), 1);
    await expect(getContentPage(translation.id)).rejects.toThrow(NotFoundError);
    const deleted = await prisma.auditEvent.findFirst({ where: { resourceId: page.id, action: 'DELETED' } });
    expect(deleted?.metadata).toMatchObject({ translationsRemoved: 1 });
  });
});

describe('Testimonial, nav and SEO translations', () => {
  it('translates a testimonial’s text while keeping its rating and author name from the English row', async () => {
    const source = await createTestimonial(
      { authorName: `${tag} Priya`, authorRole: 'Patient, Jaipur', quote: 'Great care', rating: 5, priority: 1000, active: true },
      null,
      'admin-user-id',
      {},
    );
    createdTestimonialIds.push(source.id);
    await upsertTestimonialTranslation(source.id, { language: 'hi', quote: 'बहुत अच्छी देखभाल', active: true }, 'admin-user-id', {});

    const served = (await activeTestimonials(50, 'hi')).find((t) => t.id === source.id);
    expect(served).toMatchObject({
      language: 'hi',
      quote: 'बहुत अच्छी देखभाल',
      authorName: `${tag} Priya`,
      authorRole: 'Patient, Jaipur',
      rating: 5,
    });
    expect((await activeTestimonials(50, 'en')).find((t) => t.id === source.id)?.quote).toBe('Great care');
  });

  it('relabels a nav link in Hindi without changing where it points', async () => {
    const item = await createNavMenuItem({ location: 'PUBLIC_FOOTER_COMPANY', label: `${tag} Careers`, href: '/careers', priority: 0, active: true }, {});
    createdNavIds.push(item.id);
    const translation = await upsertNavMenuItemTranslation(item.id, { language: 'hi', label: 'करियर', active: true }, {});
    expect(translation).toMatchObject({ location: 'PUBLIC_FOOTER_COMPANY', href: null, contentPageId: null });

    const { PUBLIC_FOOTER_COMPANY: hindi } = await activeNavMenus(['PUBLIC_FOOTER_COMPANY'], 'hi');
    expect(hindi.find((i) => i.key === item.id)).toEqual({ key: item.id, label: 'करियर', href: '/careers' });
    const { PUBLIC_FOOTER_COMPANY: english } = await activeNavMenus(['PUBLIC_FOOTER_COMPANY'], 'en');
    expect(english.find((i) => i.key === item.id)?.label).toBe(`${tag} Careers`);

    const row = { id: 'x', language: 'en', label: 'About', href: '/about', active: true, contentPage: null };
    expect(resolveNavItems('PUBLIC_HEADER', [row], 'hi')[0]?.label).toBe('About');
  });

  it('resolves translated SEO metadata, keeping English keywords when none are translated', async () => {
    const row = await createPageSeo(
      { pageKey: `page:test-i18n-seo-${n}`, title: 'English title', description: 'English description', keywords: ['ayurveda'], active: true },
      null,
      'admin-user-id',
      {},
    );
    createdSeoIds.push(row.id);
    expect((await resolvePageSeo(row.pageKey, undefined, 'hi')).title).toBe('English title');

    await upsertPageSeoTranslation(row.id, { language: 'hi', title: 'हिन्दी शीर्षक', description: 'हिन्दी विवरण', keywords: [], active: true }, 'admin-user-id', {});
    expect(await resolvePageSeo(row.pageKey, undefined, 'hi')).toMatchObject({
      title: 'हिन्दी शीर्षक',
      description: 'हिन्दी विवरण',
      keywords: ['ayurveda'],
    });
    expect((await resolvePageSeo(row.pageKey, undefined, 'en')).title).toBe('English title');
  });
});

describe('Public language switcher', () => {
  it('switching to हिन्दी changes what the FAQ page renders; untranslated entries stay in English', async () => {
    const translated = await newFaq('switch-translated', 0);
    const untranslated = await newFaq('switch-untranslated', 0);
    await upsertFaqTranslation(translated.id, { language: 'hi', question: `${tag} हिन्दी प्रश्न`, answer: 'हिन्दी उत्तर', active: true }, {});

    render(await FaqPage());
    expect(screen.getByText(translated.question)).toBeInTheDocument();
    expect(screen.queryByText(`${tag} हिन्दी प्रश्न`)).not.toBeInTheDocument();
    cleanup();

    render(createElement(LanguageSwitcher, { current: 'en' }));
    fireEvent.change(screen.getByLabelText('Content language'), { target: { value: 'hi' } });
    expect(document.cookie).toContain(`${CONTENT_LANGUAGE_COOKIE}=hi`);
    expect(refresh).toHaveBeenCalled();
    cleanup();

    render(await FaqPage());
    const hindiQuestion = screen.getByText(`${tag} हिन्दी प्रश्न`);
    expect(hindiQuestion.closest('[lang]')).toHaveAttribute('lang', 'hi');
    expect(screen.queryByText(translated.question)).not.toBeInTheDocument();
    expect(screen.getByText(untranslated.question).closest('[lang]')).toHaveAttribute('lang', 'en');
  });
});
