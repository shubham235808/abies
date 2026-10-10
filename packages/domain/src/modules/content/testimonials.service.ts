import { randomUUID } from 'crypto';
import type { z } from 'zod';
import { prisma } from '../../lib/db';
import { NotFoundError } from '../../lib/errors';
import { assertUploadAllowed, deleteObject, getSignedDownloadUrl, putObject } from '../../lib/storage';
import { recordAuditEvent, type AuditContext } from '../../server/audit';
import type { createTestimonialSchema, updateTestimonialSchema } from './testimonials.schemas';

type CreateTestimonialInput = z.infer<typeof createTestimonialSchema>;
type UpdateTestimonialInput = z.infer<typeof updateTestimonialSchema>;

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

export async function listTestimonials() {
  return prisma.testimonial.findMany({ orderBy: [{ active: 'desc' }, { priority: 'desc' }, { createdAt: 'desc' }] });
}

export async function getTestimonial(id: string) {
  const testimonial = await prisma.testimonial.findUnique({ where: { id } });
  if (!testimonial) throw new NotFoundError('Testimonial not found');
  return testimonial;
}

export async function createTestimonial(
  dto: CreateTestimonialInput,
  photo: UploadedImage | null,
  createdByUserId: string,
  auditCtx: AuditContext,
) {
  const id = randomUUID();
  const photoKey = photo ? await storePhoto(id, photo) : null;
  const testimonial = await prisma.testimonial.create({
    data: { id, ...dto, photoKey, createdByUserId },
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
  const existing = await getTestimonial(id);
  const photoKey = photo ? await storePhoto(id, photo) : undefined;
  const testimonial = await prisma.testimonial.update({
    where: { id },
    data: { ...dto, ...(photoKey ? { photoKey } : {}) },
  });

  // Replace-then-delete, not delete-then-replace — matches
  // updatePromotion: a failed upload above would otherwise leave the row
  // with a dangling storage key.
  if (photoKey && existing.photoKey) await deleteObject(existing.photoKey);

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

export interface ServedTestimonial {
  id: string;
  authorName: string;
  authorRole: string | null;
  quote: string;
  rating: number | null;
  photoUrl: string | null;
}

// Public-facing — no admin gate. No location/language targeting here
// (unlike Promotion) — testimonials aren't audience-segmented content.
export async function activeTestimonials(limit = 6): Promise<ServedTestimonial[]> {
  const rows = await prisma.testimonial.findMany({
    where: { active: true },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
    take: limit,
  });
  return Promise.all(
    rows.map(async (t) => ({
      id: t.id,
      authorName: t.authorName,
      authorRole: t.authorRole,
      quote: t.quote,
      rating: t.rating,
      photoUrl: t.photoKey ? await getSignedDownloadUrl(t.photoKey) : null,
    })),
  );
}
