import { randomUUID } from 'crypto';
import type { z } from 'zod';
import { prisma } from '../../lib/db';
import { ConflictError, NotFoundError } from '../../lib/errors';
import { assertUploadAllowed, deleteObject, getSignedDownloadUrl, putObject } from '../../lib/storage';
import { recordAuditEvent, type AuditContext } from '../../server/audit';
import { SITE_DEFAULT_TITLE, SITE_DESCRIPTION, seoPageDefinition } from './seo.pages';
import type { createPageSeoSchema, updatePageSeoSchema } from './seo.schemas';
import type { UploadedImage } from './testimonials.service';

type CreatePageSeoInput = z.infer<typeof createPageSeoSchema>;
type UpdatePageSeoInput = z.infer<typeof updatePageSeoSchema>;

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

export async function listPageSeo() {
  return prisma.pageSeoMetadata.findMany({ orderBy: { pageKey: 'asc' } });
}

export async function getPageSeo(id: string) {
  const row = await prisma.pageSeoMetadata.findUnique({ where: { id } });
  if (!row) throw new NotFoundError('SEO metadata not found');
  return row;
}

export async function createPageSeo(
  dto: CreatePageSeoInput,
  ogImage: UploadedImage | null,
  createdByUserId: string,
  auditCtx: AuditContext,
) {
  const clash = await prisma.pageSeoMetadata.findUnique({ where: { pageKey: dto.pageKey } });
  if (clash) throw new ConflictError('This page already has SEO metadata — edit it instead');
  const id = randomUUID();
  const ogImageKey = ogImage ? await storeOgImage(id, ogImage) : null;
  const row = await prisma.pageSeoMetadata.create({ data: { id, ...dto, ogImageKey, createdByUserId } });
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
  const existing = await getPageSeo(id);
  const { clearOgImage, ...fields } = dto;
  const newKey = ogImage ? await storeOgImage(id, ogImage) : undefined;
  const ogImageKey = newKey ?? (clearOgImage ? null : undefined);
  const row = await prisma.pageSeoMetadata.update({
    where: { id },
    data: { ...fields, ...(ogImageKey !== undefined ? { ogImageKey } : {}) },
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

export interface ResolvedPageSeo {
  title: string;
  description: string;
  keywords: string[];
  ogImageUrl: string | null;
  customised: boolean;
}

// Public-facing — no admin gate, read on every request. Always returns a
// complete title/description: an active row wins, otherwise the caller's
// fallback (for content pages, derived from the page itself), otherwise the
// SEO_PAGES default. Never blank.
export async function resolvePageSeo(
  pageKey: string,
  fallback?: { title: string; description: string },
): Promise<ResolvedPageSeo> {
  const row = await prisma.pageSeoMetadata.findUnique({ where: { pageKey } });
  if (row && row.active) {
    return {
      title: row.title,
      description: row.description,
      keywords: row.keywords,
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
