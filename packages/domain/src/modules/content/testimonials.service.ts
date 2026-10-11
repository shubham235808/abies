import { randomUUID } from 'crypto';
import { MediaKind } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '../../lib/db';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { assertUploadAllowed, deleteObject, putObject } from '../../lib/storage';
import { recordAuditEvent, type AuditContext } from '../../server/audit';
import { requireMediaAsset } from '../media/media.service';
import { DEFAULT_CONTENT_LANGUAGE, localise, type ContentLanguage, type TranslationLanguage } from './languages';
import type { createTestimonialSchema, updateTestimonialSchema, upsertTestimonialTranslationSchema } from './testimonials.schemas';

type CreateTestimonialInput = z.infer<typeof createTestimonialSchema>;
type UpdateTestimonialInput = z.infer<typeof updateTestimonialSchema>;
type UpsertTestimonialTranslationInput = z.infer<typeof upsertTestimonialTranslationSchema>;

const WITH_TRANSLATIONS = { translations: { orderBy: { language: 'asc' } } } as const;

export interface UploadedImage {
  originalName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
}

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

function storePhoto(testimonialId: string, file: UploadedImage): Promise<string> {
  assertUploadAllowed({ mimetype: file.mimeType, size: file.size, buffer: file.buffer }, { allowedMimeTypes: IMAGE_MIME_TYPES });
  const storedName = `${randomUUID()}-${file.originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const key = `testimonials/${testimonialId}/${storedName}`;
  return putObject({ key, body: file.buffer, contentType: file.mimeType }).then(() => key);
}

async function assertMediaRefs(dto: { photoAssetId?: string | null; videoAssetId?: string | null }, photo: UploadedImage | null) {
  if (photo && dto.photoAssetId) throw new BadRequestError('Upload a photo or choose one from the media library, not both');
  if (dto.photoAssetId) await requireMediaAsset(dto.photoAssetId, MediaKind.IMAGE);
  if (dto.videoAssetId) await requireMediaAsset(dto.videoAssetId, MediaKind.VIDEO);
}

// English testimonials only, each carrying its translations.
export async function listTestimonials() {
  return prisma.testimonial.findMany({
    where: { translationOfId: null },
    include: WITH_TRANSLATIONS,
    orderBy: [{ active: 'desc' }, { priority: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function getTestimonial(id: string) {
  const testimonial = await prisma.testimonial.findUnique({ where: { id } });
  if (!testimonial) throw new NotFoundError('Testimonial not found');
  return testimonial;
}

// Photo, rating and publish state belong to the English testimonial; a
// translation row is only edited through upsertTestimonialTranslation.
async function getEnglishTestimonial(id: string) {
  const testimonial = await prisma.testimonial.findFirst({ where: { id, translationOfId: null } });
  if (!testimonial) throw new NotFoundError('Testimonial not found');
  return testimonial;
}

export async function createTestimonial(
  dto: CreateTestimonialInput,
  photo: UploadedImage | null,
  createdByUserId: string,
  auditCtx: AuditContext,
) {
  await assertMediaRefs(dto, photo);
  const id = randomUUID();
  const photoKey = photo ? await storePhoto(id, photo) : null;
  const testimonial = await prisma.testimonial.create({
    data: { id, ...dto, photoKey, createdByUserId },
    include: WITH_TRANSLATIONS,
  });
  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: 'CREATED',
    resourceType: 'Testimonial',
    resourceId: testimonial.id,
    metadata: { authorName: testimonial.authorName },
  });
  return testimonial;
}

export async function updateTestimonial(
  id: string,
  dto: UpdateTestimonialInput,
  photo: UploadedImage | null,
  auditCtx: AuditContext,
) {
  const existing = await getEnglishTestimonial(id);
  await assertMediaRefs(dto, photo);
  const photoKey = photo ? await storePhoto(id, photo) : undefined;
  // A fresh upload and a library pick each replace whichever kind of photo
  // the testimonial had before.
  const photoChange = photoKey ? { photoKey, photoAssetId: null } : dto.photoAssetId ? { photoKey: null } : {};
  const testimonial = await prisma.testimonial.update({
    where: { id },
    data: { ...dto, ...photoChange },
    include: WITH_TRANSLATIONS,
  });

  // Replace-then-delete, not delete-then-replace — matches
  // updatePromotion: a failed upload above would otherwise leave the row
  // with a dangling storage key.
  // Only the testimonial's own upload is deleted — a library asset stays in
  // the library for reuse.
  if ((photoKey || dto.photoAssetId) && existing.photoKey) await deleteObject(existing.photoKey);

  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: 'UPDATED',
    resourceType: 'Testimonial',
    resourceId: id,
    metadata: { fields: Object.keys(dto) },
  });
  return testimonial;
}

export async function removeTestimonial(id: string, auditCtx: AuditContext) {
  const testimonial = await getTestimonial(id);
  await prisma.testimonial.delete({ where: { id } });
  if (testimonial.photoKey) await deleteObject(testimonial.photoKey);
  await recordAuditEvent(auditCtx, { eventType: 'CONTENT', action: 'DELETED', resourceType: 'Testimonial', resourceId: id });
}

export async function upsertTestimonialTranslation(
  sourceId: string,
  dto: UpsertTestimonialTranslationInput,
  createdByUserId: string,
  auditCtx: AuditContext,
) {
  const source = await getEnglishTestimonial(sourceId);
  const { language, ...fields } = dto;
  const text = { ...fields, authorName: fields.authorName ?? source.authorName, authorRole: fields.authorRole ?? null };
  const key = { translationOfId_language: { translationOfId: source.id, language } };
  const existing = await prisma.testimonial.findUnique({ where: key });
  const translation = await prisma.testimonial.upsert({
    where: key,
    create: { ...text, language, translationOfId: source.id, priority: source.priority, createdByUserId },
    update: text,
  });
  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: existing ? 'UPDATED' : 'CREATED',
    resourceType: 'Testimonial',
    resourceId: translation.id,
    metadata: { translationOf: source.id, language },
  });
  return translation;
}

export async function removeTestimonialTranslation(sourceId: string, language: TranslationLanguage, auditCtx: AuditContext) {
  const translation = await prisma.testimonial.findUnique({ where: { translationOfId_language: { translationOfId: sourceId, language } } });
  if (!translation) throw new NotFoundError('Translation not found');
  await prisma.testimonial.delete({ where: { id: translation.id } });
  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: 'DELETED',
    resourceType: 'Testimonial',
    resourceId: translation.id,
    metadata: { translationOf: sourceId, language },
  });
}

export interface ServedTestimonial {
  id: string;
  language: string;
  authorName: string;
  authorRole: string | null;
  quote: string;
  rating: number | null;
  photoUrl: string | null;
  videoUrl: string | null;
}

// Public-facing — no admin gate. No location/language targeting here
// (unlike Promotion) — testimonials aren't audience-segmented content; the
// language only picks which text a testimonial is shown in, falling back to
// English per testimonial when it has no published translation.
export async function activeTestimonials(
  limit = 6,
  language: ContentLanguage = DEFAULT_CONTENT_LANGUAGE,
): Promise<ServedTestimonial[]> {
  const rows = await prisma.testimonial.findMany({
    where: { active: true, translationOfId: null },
    include: { translations: { where: { language } }, photoAsset: { select: { storageKey: true } } },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  });
  return Promise.all(
    rows.map(async (t) => {
      const served = localise(t, t.translations, language);
      return {
        id: t.id,
        language: served.language,
        authorName: served.authorName,
        authorRole: served.authorRole ?? t.authorRole,
        quote: served.quote,
        rating: t.rating,
        // Same-origin proxy route, not a direct signed URL — STORAGE_ENDPOINT
        // is an in-cluster-only host no browser can reach (lib/storage.ts).
        photoUrl: t.photoAsset || t.photoKey ? `/api/v1/public/testimonials/${t.id}/photo` : null,
        videoUrl: t.videoAssetId ? `/api/v1/public/testimonials/${t.id}/video` : null,
      };
    }),
  );
}

// The image behind a public testimonial's photoUrl — a library asset if one
// was picked, otherwise the testimonial's own uploaded photoKey. Same
// active-English-only gate as activeTestimonials, so the route can't be
// used to read an arbitrary key or an unpublished testimonial's photo.
export async function publicTestimonialPhoto(id: string): Promise<{ storageKey: string }> {
  const testimonial = await prisma.testimonial.findFirst({
    where: { id, active: true, translationOfId: null },
    select: { photoKey: true, photoAsset: { select: { storageKey: true } } },
  });
  const storageKey = testimonial?.photoAsset?.storageKey ?? testimonial?.photoKey;
  if (!storageKey) throw new NotFoundError('Photo not found');
  return { storageKey };
}

// The library asset behind a public testimonial's videoUrl — same
// active-English-only gate as activeTestimonials, so the route can't be
// used to read an arbitrary library object or an unpublished video.
export async function publicTestimonialVideo(id: string) {
  const testimonial = await prisma.testimonial.findFirst({
    where: { id, active: true, translationOfId: null },
    select: { videoAsset: { select: { storageKey: true, mimeType: true, sizeBytes: true } } },
  });
  if (!testimonial?.videoAsset) throw new NotFoundError('Video not found');
  return testimonial.videoAsset;
}
