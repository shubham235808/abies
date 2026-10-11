import { randomUUID } from 'crypto';
import type { z } from 'zod';
import { prisma } from '../../lib/db';
import { ConflictError, NotFoundError } from '../../lib/errors';
import { assertUploadAllowed, deleteObject, getSignedDownloadUrl, putObject } from '../../lib/storage';
import { recordAuditEvent, type AuditContext } from '../../server/audit';
import { DEFAULT_CONTENT_LANGUAGE, localise, type ContentLanguage, type TranslationLanguage } from './languages';
import { SITE_DEFAULT_TITLE, SITE_DESCRIPTION, seoPageDefinition } from './seo.pages';
import type { createPageSeoSchema, updatePageSeoSchema, upsertPageSeoTranslationSchema } from './seo.schemas';
import type { UploadedImage } from './testimonials.service';

type CreatePageSeoInput = z.infer<typeof createPageSeoSchema>;
type UpdatePageSeoInput = z.infer<typeof updatePageSeoSchema>;
type UpsertPageSeoTranslationInput = z.infer<typeof upsertPageSeoTranslationSchema>;

const WITH_TRANSLATIONS = { translations: { orderBy: { language: 'asc' } } } as const;

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

// Social crawlers fetch og:image some time after the page itself (often
// queued), so the default 5-minute signed URL is too short to be reliable.
const OG_IMAGE_URL_TTL_SECONDS = 24 * 60 * 60;

function storeOgImage(seoId: string, file: UploadedImage): Promise<string> {
  assertUploadAllowed({ mimetype: file.mimeType, size: file.size, buffer: file.buffer }, { allowedMimeTypes: IMAGE_MIME_TYPES });
  const storedName = `${randomUUID()}-${file.originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const key = `seo/${seoId}/${storedName}`;
  return putObject({ key, body: file.buffer, contentType: file.mimeType }).then(() => key);
}

// English rows only, each carrying its translations.
export async function listPageSeo() {
  return prisma.pageSeoMetadata.findMany({ where: { translationOfId: null }, include: WITH_TRANSLATIONS, orderBy: { pageKey: 'asc' } });
}

export async function getPageSeo(id: string) {
  const row = await prisma.pageSeoMetadata.findUnique({ where: { id } });
  if (!row) throw new NotFoundError('SEO metadata not found');
  return row;
}

// The OG image and publish state belong to the English row; a translation
// row is only edited through upsertPageSeoTranslation.
async function getEnglishPageSeo(id: string) {
  const row = await prisma.pageSeoMetadata.findFirst({ where: { id, translationOfId: null } });
  if (!row) throw new NotFoundError('SEO metadata not found');
  return row;
}

export async function createPageSeo(
  dto: CreatePageSeoInput,
  ogImage: UploadedImage | null,
  createdByUserId: string,
  auditCtx: AuditContext,
) {
  const clash = await prisma.pageSeoMetadata.findUnique({
    where: { pageKey_language: { pageKey: dto.pageKey, language: DEFAULT_CONTENT_LANGUAGE } },
  });
  if (clash) throw new ConflictError('This page already has SEO metadata — edit it instead');
  const id = randomUUID();
  const ogImageKey = ogImage ? await storeOgImage(id, ogImage) : null;
  const row = await prisma.pageSeoMetadata.create({ data: { id, ...dto, ogImageKey, createdByUserId }, include: WITH_TRANSLATIONS });
  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: 'CREATED',
    resourceType: 'PageSeoMetadata',
    resourceId: row.id,
    metadata: { pageKey: row.pageKey },
  });
  return row;
}

export async function updatePageSeo(
  id: string,
  dto: UpdatePageSeoInput,
  ogImage: UploadedImage | null,
  auditCtx: AuditContext,
) {
  const existing = await getEnglishPageSeo(id);
  const { clearOgImage, ...fields } = dto;
  const newKey = ogImage ? await storeOgImage(id, ogImage) : undefined;
  const ogImageKey = newKey ?? (clearOgImage ? null : undefined);
  const row = await prisma.pageSeoMetadata.update({
    where: { id },
    data: { ...fields, ...(ogImageKey !== undefined ? { ogImageKey } : {}) },
    include: WITH_TRANSLATIONS,
  });

  // Replace-then-delete, same ordering as updateTestimonial/updatePromotion.
  if (ogImageKey !== undefined && existing.ogImageKey) await deleteObject(existing.ogImageKey);

  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: 'UPDATED',
    resourceType: 'PageSeoMetadata',
    resourceId: id,
    metadata: { pageKey: row.pageKey, fields: Object.keys(dto), ogImageReplaced: Boolean(newKey) },
  });
  return row;
}

export async function removePageSeo(id: string, auditCtx: AuditContext) {
  const row = await getPageSeo(id);
  await prisma.pageSeoMetadata.delete({ where: { id } });
  if (row.ogImageKey) await deleteObject(row.ogImageKey);
  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: 'DELETED',
    resourceType: 'PageSeoMetadata',
    resourceId: id,
    metadata: { pageKey: row.pageKey },
  });
}

export async function upsertPageSeoTranslation(
  sourceId: string,
  dto: UpsertPageSeoTranslationInput,
  createdByUserId: string,
  auditCtx: AuditContext,
) {
  const source = await getEnglishPageSeo(sourceId);
  const { language, ...fields } = dto;
  const key = { translationOfId_language: { translationOfId: source.id, language } };
  const existing = await prisma.pageSeoMetadata.findUnique({ where: key });
  const translation = await prisma.pageSeoMetadata.upsert({
    where: key,
    create: { ...fields, pageKey: source.pageKey, language, translationOfId: source.id, createdByUserId },
    update: fields,
  });
  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: existing ? 'UPDATED' : 'CREATED',
    resourceType: 'PageSeoMetadata',
    resourceId: translation.id,
    metadata: { pageKey: source.pageKey, translationOf: source.id, language },
  });
  return translation;
}

export async function removePageSeoTranslation(sourceId: string, language: TranslationLanguage, auditCtx: AuditContext) {
  const translation = await prisma.pageSeoMetadata.findUnique({ where: { translationOfId_language: { translationOfId: sourceId, language } } });
  if (!translation) throw new NotFoundError('Translation not found');
  await prisma.pageSeoMetadata.delete({ where: { id: translation.id } });
  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: 'DELETED',
    resourceType: 'PageSeoMetadata',
    resourceId: translation.id,
    metadata: { pageKey: translation.pageKey, translationOf: sourceId, language },
  });
}

export interface ResolvedPageSeo {
  title: string;
  description: string;
  keywords: string[];
  ogImageUrl: string | null;
  customised: boolean;
}

// Public-facing — no admin gate, read on every request. Always returns a
// complete title/description: an active English row wins (in the requested
// language when it has a published translation), otherwise the caller's
// fallback (for content pages, derived from the page itself), otherwise the
// SEO_PAGES default. Never blank.
export async function resolvePageSeo(
  pageKey: string,
  fallback?: { title: string; description: string },
  language: ContentLanguage = DEFAULT_CONTENT_LANGUAGE,
): Promise<ResolvedPageSeo> {
  const row = await prisma.pageSeoMetadata.findUnique({
    where: { pageKey_language: { pageKey, language: DEFAULT_CONTENT_LANGUAGE } },
    include: { translations: { where: { language } } },
  });
  if (row && row.active) {
    const served = localise(row, row.translations, language);
    return {
      title: served.title,
      description: served.description,
      keywords: served.keywords.length > 0 ? served.keywords : row.keywords,
      ogImageUrl: row.ogImageKey ? await getSignedDownloadUrl(row.ogImageKey, OG_IMAGE_URL_TTL_SECONDS) : null,
      customised: true,
    };
  }
  const def = seoPageDefinition(pageKey);
  return {
    title: fallback?.title ?? def?.defaultTitle ?? SITE_DEFAULT_TITLE,
    description: fallback?.description ?? def?.defaultDescription ?? SITE_DESCRIPTION,
    keywords: [],
    ogImageUrl: null,
    customised: false,
  };
}
