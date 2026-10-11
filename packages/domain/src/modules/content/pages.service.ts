import type { z } from 'zod';
import { prisma } from '../../lib/db';
import { ConflictError, NotFoundError } from '../../lib/errors';
import { recordAuditEvent, type AuditContext } from '../../server/audit';
import { DEFAULT_CONTENT_LANGUAGE, localise, type ContentLanguage, type TranslationLanguage } from './languages';
import type { createContentPageSchema, updateContentPageSchema, upsertContentPageTranslationSchema } from './pages.schemas';

type CreateContentPageInput = z.infer<typeof createContentPageSchema>;
type UpdateContentPageInput = z.infer<typeof updateContentPageSchema>;
type UpsertContentPageTranslationInput = z.infer<typeof upsertContentPageTranslationSchema>;

const WITH_TRANSLATIONS = { translations: { orderBy: { language: 'asc' } } } as const;

// English pages only, each carrying its translations.
export async function listContentPages() {
  return prisma.contentPage.findMany({
    where: { translationOfId: null },
    include: WITH_TRANSLATIONS,
    orderBy: [{ active: 'desc' }, { slug: 'asc' }],
  });
}

export async function getContentPage(id: string) {
  const page = await prisma.contentPage.findUnique({ where: { id } });
  if (!page) throw new NotFoundError('Content page not found');
  return page;
}

// Publish state belongs to the English page; a translation row is only
// edited through upsertContentPageTranslation.
async function getEnglishContentPage(id: string) {
  const page = await prisma.contentPage.findFirst({ where: { id, translationOfId: null } });
  if (!page) throw new NotFoundError('Content page not found');
  return page;
}

export async function createContentPage(dto: CreateContentPageInput, auditCtx: AuditContext) {
  const clash = await prisma.contentPage.findUnique({ where: { slug_language: { slug: dto.slug, language: DEFAULT_CONTENT_LANGUAGE } } });
  if (clash) throw new ConflictError(`A page with the slug "${dto.slug}" already exists`);
  const page = await prisma.contentPage.create({ data: dto, include: WITH_TRANSLATIONS });
  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: 'CREATED',
    resourceType: 'ContentPage',
    resourceId: page.id,
    metadata: { slug: page.slug },
  });
  return page;
}

export async function updateContentPage(id: string, dto: UpdateContentPageInput, auditCtx: AuditContext) {
  await getEnglishContentPage(id);
  const page = await prisma.contentPage.update({ where: { id }, data: dto, include: WITH_TRANSLATIONS });
  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: 'UPDATED',
    resourceType: 'ContentPage',
    resourceId: id,
    metadata: { slug: page.slug, fields: Object.keys(dto) },
  });
  return page;
}

export async function removeContentPage(id: string, auditCtx: AuditContext) {
  const page = await getContentPage(id);
  // Counted before the delete because the FK cascades remove these rows —
  // the audit trail should still say a header/footer link or a translation
  // went with it.
  const [navItemsRemoved, translationsRemoved] = await Promise.all([
    prisma.navMenuItem.count({ where: { contentPageId: id } }),
    prisma.contentPage.count({ where: { translationOfId: id } }),
  ]);
  await prisma.contentPage.delete({ where: { id } });
  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: 'DELETED',
    resourceType: 'ContentPage',
    resourceId: id,
    metadata: { slug: page.slug, language: page.language, navItemsRemoved, translationsRemoved },
  });
}

export async function upsertContentPageTranslation(
  sourceId: string,
  dto: UpsertContentPageTranslationInput,
  auditCtx: AuditContext,
) {
  const source = await getEnglishContentPage(sourceId);
  const { language, ...fields } = dto;
  const key = { translationOfId_language: { translationOfId: source.id, language } };
  const existing = await prisma.contentPage.findUnique({ where: key });
  const translation = await prisma.contentPage.upsert({
    where: key,
    create: { ...fields, slug: source.slug, language, translationOfId: source.id },
    update: fields,
  });
  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: existing ? 'UPDATED' : 'CREATED',
    resourceType: 'ContentPage',
    resourceId: translation.id,
    metadata: { slug: source.slug, translationOf: source.id, language },
  });
  return translation;
}

export async function removeContentPageTranslation(sourceId: string, language: TranslationLanguage, auditCtx: AuditContext) {
  const translation = await prisma.contentPage.findUnique({ where: { translationOfId_language: { translationOfId: sourceId, language } } });
  if (!translation) throw new NotFoundError('Translation not found');
  await prisma.contentPage.delete({ where: { id: translation.id } });
  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: 'DELETED',
    resourceType: 'ContentPage',
    resourceId: translation.id,
    metadata: { slug: translation.slug, translationOf: sourceId, language },
  });
}

// Public-facing — no admin gate. Unpublished and missing are the same thing
// to a visitor. Whether the page is live at all is the English page's
// decision; the requested language only picks which text is shown, falling
// back to English when there's no published translation.
export async function activeContentPageBySlug(slug: string, language: ContentLanguage = DEFAULT_CONTENT_LANGUAGE) {
  const page = await prisma.contentPage.findUnique({
    where: { slug_language: { slug, language: DEFAULT_CONTENT_LANGUAGE } },
    include: { translations: { where: { language } } },
  });
  if (!page || !page.active) return null;
  const { translations, ...english } = page;
  return localise(english, translations, language);
}
