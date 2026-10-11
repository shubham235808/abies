// @vitest-environment node
import { randomInt } from 'crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@abies/domain/lib/db';
import { BadRequestError, ConflictError, NotFoundError } from '@abies/domain/lib/errors';
import { createNavMenuItemSchema, DEFAULT_NAV_MENUS } from '@abies/domain/modules/content/nav.schemas';
import {
  activeNavMenus,
  createNavMenuItem,
  getNavMenuItem,
  listNavMenuItems,
  removeNavMenuItem,
  resolveNavItems,
  updateNavMenuItem,
} from '@abies/domain/modules/content/nav.service';
import { createContentPageSchema, publicPathForContentPage } from '@abies/domain/modules/content/pages.schemas';
import {
  activeContentPageBySlug,
  createContentPage,
  getContentPage,
  listContentPages,
  removeContentPage,
  updateContentPage,
} from '@abies/domain/modules/content/pages.service';
import { contentPageSeoFallback, seoKeyForContentPage, SEO_PAGES } from '@abies/domain/modules/content/seo.pages';
import { createPageSeoSchema } from '@abies/domain/modules/content/seo.schemas';
import {
  createPageSeo,
  getPageSeo,
  listPageSeo,
  removePageSeo,
  resolvePageSeo,
  updatePageSeo,
} from '@abies/domain/modules/content/seo.service';
import type { UploadedImage } from '@abies/domain/modules/content/testimonials.service';

const n = randomInt(100000, 999999);
const slug = (suffix: string) => `test-content-${n}-${suffix}`;
const createdPageIds: string[] = [];
const createdNavIds: string[] = [];
const createdSeoIds: string[] = [];

afterAll(async () => {
  for (const id of createdNavIds) await removeNavMenuItem(id, {}).catch(() => {});
  for (const id of createdSeoIds) await removePageSeo(id, {}).catch(() => {});
  for (const id of createdPageIds) await removeContentPage(id, {}).catch(() => {});
  await prisma.$disconnect();
});

// Same magic-byte-valid fake JPEG as content.test.ts / promotions.test.ts.
const fakeImage: UploadedImage = {
  originalName: 'og.jpg',
  mimeType: 'image/jpeg',
  size: 1024,
  buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('fake-jpeg-bytes')]),
};

async function newPage(suffix: string, active = true) {
  const page = await createContentPage({ slug: slug(suffix), title: `Page ${suffix}`, body: `Body for ${suffix}`, active }, {});
  createdPageIds.push(page.id);
  return page;
}

describe('Content pages (multi-slug)', () => {
  it('creates, lists, updates and removes an arbitrary-slug page, auditing each write', async () => {
    const page = await newPage('crud');
    expect((await listContentPages()).some((p) => p.id === page.id)).toBe(true);

    const updated = await updateContentPage(page.id, { title: 'Renamed' }, {});
    expect(updated.title).toBe('Renamed');
    expect(updated.slug).toBe(page.slug);

    await removeContentPage(page.id, {});
    await expect(getContentPage(page.id)).rejects.toThrow(NotFoundError);
    createdPageIds.splice(createdPageIds.indexOf(page.id), 1);

    const actions = (await prisma.auditEvent.findMany({ where: { resourceId: page.id, resourceType: 'ContentPage' } })).map((e) => e.action);
    expect(actions.sort()).toEqual(['CREATED', 'DELETED', 'UPDATED']);
  });

  it('rejects a duplicate slug and a malformed slug', async () => {
    const page = await newPage('dup');
    await expect(createContentPage({ slug: page.slug, title: 't', body: 'b', active: true }, {})).rejects.toThrow(ConflictError);
    expect(createContentPageSchema.safeParse({ slug: 'Bad Slug', title: 't', body: 'b' }).success).toBe(false);
    expect(createContentPageSchema.safeParse({ slug: 'bad--slug', title: 't', body: 'b' }).success).toBe(false);
  });

  it('serves a page publicly only while active', async () => {
    const page = await newPage('public');
    expect((await activeContentPageBySlug(page.slug))?.id).toBe(page.id);
    await updateContentPage(page.id, { active: false }, {});
    expect(await activeContentPageBySlug(page.slug)).toBeNull();
    expect(await activeContentPageBySlug(slug('never-created'))).toBeNull();
  });

  it('maps dedicated slugs to their own routes and everything else to /pages/<slug>', () => {
    expect(publicPathForContentPage('about-us')).toBe('/about');
    expect(publicPathForContentPage('terms')).toBe('/terms');
    expect(publicPathForContentPage('privacy')).toBe('/privacy');
    expect(publicPathForContentPage('shipping-policy')).toBe('/pages/shipping-policy');
    expect(publicPathForContentPage('constructor')).toBe('/pages/constructor');
  });
});

describe('Navigation menu items', () => {
  it('validates href safety and exactly-one target at the schema level', () => {
    const base = { location: 'PUBLIC_FOOTER_COMPANY', label: 'x' };
    expect(createNavMenuItemSchema.safeParse({ ...base, href: '/doctors' }).success).toBe(true);
    expect(createNavMenuItemSchema.safeParse({ ...base, href: 'https://example.com' }).success).toBe(true);
    expect(createNavMenuItemSchema.safeParse({ ...base, href: 'javascript:alert(1)' }).success).toBe(false);
    expect(createNavMenuItemSchema.safeParse({ ...base, href: '//evil.example' }).success).toBe(false);
    expect(createNavMenuItemSchema.safeParse({ ...base, href: 'http://insecure.example' }).success).toBe(false);
    expect(createNavMenuItemSchema.safeParse(base).success).toBe(false);
    expect(createNavMenuItemSchema.safeParse({ ...base, href: '/a', contentPageId: 'p' }).success).toBe(false);
  });

  it('creates, lists, updates and removes a URL item, auditing each write', async () => {
    const item = await createNavMenuItem({ location: 'PUBLIC_FOOTER_COMPANY', label: `nav ${n}`, href: '/careers', priority: 0, active: true }, {});
    createdNavIds.push(item.id);
    expect((await listNavMenuItems()).some((i) => i.id === item.id)).toBe(true);

    const updated = await updateNavMenuItem(item.id, { label: `nav ${n} renamed` }, {});
    expect(updated.label).toBe(`nav ${n} renamed`);

    await removeNavMenuItem(item.id, {});
    await expect(getNavMenuItem(item.id)).rejects.toThrow(NotFoundError);
    createdNavIds.splice(createdNavIds.indexOf(item.id), 1);

    const actions = (await prisma.auditEvent.findMany({ where: { resourceId: item.id, resourceType: 'NavMenuItem' } })).map((e) => e.action);
    expect(actions.sort()).toEqual(['CREATED', 'DELETED', 'UPDATED']);
  });

  it('switches an item between URL and content-page targets, and refuses to leave it with neither', async () => {
    const page = await newPage('nav-target');
    const item = await createNavMenuItem({ location: 'PUBLIC_FOOTER_COMPANY', label: `switch ${n}`, href: '/x', priority: 0, active: true }, {});
    createdNavIds.push(item.id);

    const toPage = await updateNavMenuItem(item.id, { href: null, contentPageId: page.id }, {});
    expect(toPage.href).toBeNull();
    expect(toPage.contentPage?.slug).toBe(page.slug);

    await expect(updateNavMenuItem(item.id, { contentPageId: null }, {})).rejects.toThrow(BadRequestError);
    await expect(updateNavMenuItem(item.id, { href: '/both' }, {})).rejects.toThrow(BadRequestError);
    await expect(
      createNavMenuItem({ location: 'PUBLIC_FOOTER_COMPANY', label: 'ghost', contentPageId: 'does-not-exist', priority: 0, active: true }, {}),
    ).rejects.toThrow(BadRequestError);
  });

  it('serves active items in priority order, resolves page links, and hides hidden items and unpublished pages', async () => {
    const page = await newPage('nav-served');
    const draft = await newPage('nav-draft', false);
    const high = await createNavMenuItem({ location: 'PUBLIC_FOOTER_COMPANY', label: `high ${n}`, href: '/high', priority: 999, active: true }, {});
    const pageLink = await createNavMenuItem({ location: 'PUBLIC_FOOTER_COMPANY', label: `page ${n}`, contentPageId: page.id, priority: 998, active: true }, {});
    const hidden = await createNavMenuItem({ location: 'PUBLIC_FOOTER_COMPANY', label: `hidden ${n}`, href: '/hidden', priority: 997, active: false }, {});
    const draftLink = await createNavMenuItem({ location: 'PUBLIC_FOOTER_COMPANY', label: `draft ${n}`, contentPageId: draft.id, priority: 996, active: true }, {});
    createdNavIds.push(high.id, pageLink.id, hidden.id, draftLink.id);

    const { PUBLIC_FOOTER_COMPANY: served } = await activeNavMenus(['PUBLIC_FOOTER_COMPANY']);
    const ours = served.filter((s) => [high.id, pageLink.id, hidden.id, draftLink.id].includes(s.key));
    expect(ours.map((s) => s.key)).toEqual([high.id, pageLink.id]);
    expect(ours[1]?.href).toBe(`/pages/${page.slug}`);
  });

  it('removes nav links along with the content page they point to', async () => {
    const page = await newPage('nav-cascade');
    const item = await createNavMenuItem({ location: 'PUBLIC_FOOTER_COMPANY', label: `cascade ${n}`, contentPageId: page.id, priority: 0, active: true }, {});
    createdNavIds.push(item.id);

    await removeContentPage(page.id, {});
    createdPageIds.splice(createdPageIds.indexOf(page.id), 1);
    await expect(getNavMenuItem(item.id)).rejects.toThrow(NotFoundError);

    const deleted = await prisma.auditEvent.findFirst({ where: { resourceId: page.id, action: 'DELETED' } });
    expect(deleted?.metadata).toMatchObject({ navItemsRemoved: 1 });
  });

  it('falls back to the built-in defaults only for a never-configured location', () => {
    expect(resolveNavItems('PUBLIC_HEADER', []).map((i) => i.href)).toEqual(DEFAULT_NAV_MENUS.PUBLIC_HEADER.map((l) => l.href));
    const allHidden = [{ id: 'a', language: 'en', label: 'A', href: '/a', active: false, contentPage: null }];
    expect(resolveNavItems('PUBLIC_HEADER', allHidden)).toEqual([]);
  });
});

describe('Page SEO metadata', () => {
  it('returns complete defaults when no row exists — never blank', async () => {
    const about = SEO_PAGES.find((p) => p.key === 'about');
    const key = seoKeyForContentPage(slug('no-row'));
    const resolved = await resolvePageSeo(key, { title: 'Fallback title', description: 'Fallback description' });
    expect(resolved).toMatchObject({ title: 'Fallback title', description: 'Fallback description', customised: false, ogImageUrl: null });

    const unknown = await resolvePageSeo(key);
    expect(unknown.title.length).toBeGreaterThan(0);
    expect(unknown.description.length).toBeGreaterThan(0);
    expect(about?.defaultTitle).toBeTruthy();
  });

  it('creates with an OG image, serves it while active, falls back while inactive, and audits each write', async () => {
    const pageKey = seoKeyForContentPage(slug('seo'));
    const row = await createPageSeo(
      { pageKey, title: `SEO ${n}`, description: 'Custom description', keywords: ['ayurveda'], active: true },
      fakeImage,
      'admin-user-id',
      {},
    );
    createdSeoIds.push(row.id);
    expect(row.ogImageKey).toContain(`seo/${row.id}/`);
    expect((await listPageSeo()).some((r) => r.id === row.id)).toBe(true);

    const live = await resolvePageSeo(pageKey);
    expect(live).toMatchObject({ title: `SEO ${n}`, description: 'Custom description', keywords: ['ayurveda'], customised: true });
    expect(live.ogImageUrl).toMatch(/^https?:\/\//);

    await updatePageSeo(row.id, { active: false }, null, {});
    expect((await resolvePageSeo(pageKey, { title: 'Default', description: 'Default d' })).title).toBe('Default');

    const cleared = await updatePageSeo(row.id, { active: true, clearOgImage: true }, null, {});
    expect(cleared.ogImageKey).toBeNull();
    expect((await resolvePageSeo(pageKey)).ogImageUrl).toBeNull();

    await removePageSeo(row.id, {});
    await expect(getPageSeo(row.id)).rejects.toThrow(NotFoundError);
    createdSeoIds.splice(createdSeoIds.indexOf(row.id), 1);

    const actions = (await prisma.auditEvent.findMany({ where: { resourceId: row.id, resourceType: 'PageSeoMetadata' } })).map((e) => e.action);
    expect(actions.sort()).toEqual(['CREATED', 'DELETED', 'UPDATED', 'UPDATED']);
  });

  it('rejects a duplicate pageKey and an unknown pageKey', async () => {
    const pageKey = seoKeyForContentPage(slug('seo-dup'));
    const row = await createPageSeo({ pageKey, title: 't', description: 'd', keywords: [], active: true }, null, 'admin-user-id', {});
    createdSeoIds.push(row.id);
    await expect(createPageSeo({ pageKey, title: 't', description: 'd', keywords: [], active: true }, null, 'admin-user-id', {})).rejects.toThrow(
      ConflictError,
    );
    expect(createPageSeoSchema.safeParse({ pageKey: 'not-a-page', title: 't', description: 'd' }).success).toBe(false);
    expect(createPageSeoSchema.safeParse({ pageKey: 'doctors', title: 't', description: 'd' }).success).toBe(true);
  });

  it('derives a content page fallback from its own title and a truncated body', () => {
    const fallback = contentPageSeoFallback({ title: 'Shipping', body: 'word '.repeat(100) });
    expect(fallback.title).toBe('Shipping — ABIES');
    expect(fallback.description.length).toBeLessThanOrEqual(160);
    expect(fallback.description.endsWith('…')).toBe(true);
  });
});
