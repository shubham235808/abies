import { randomUUID } from 'crypto';
import type { z } from 'zod';
import { prisma } from '../../lib/db';
import { NotFoundError } from '../../lib/errors';
import { assertUploadAllowed, deleteObject, putObject } from '../../lib/storage';
import { recordAuditEvent, type AuditContext } from '../../server/audit';
import type { PromotionPlacement } from '@prisma/client';
import type { createPromotionSchema, updatePromotionSchema } from './promotions.schemas';

type CreatePromotionInput = z.infer<typeof createPromotionSchema>;
type UpdatePromotionInput = z.infer<typeof updatePromotionSchema>;

export interface UploadedImage {
  originalName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
}

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

function storeImage(promotionId: string, slot: 'desktop' | 'mobile', file: UploadedImage): Promise<string> {
  assertUploadAllowed({ mimetype: file.mimeType, size: file.size, buffer: file.buffer }, { allowedMimeTypes: IMAGE_MIME_TYPES });
  const storedName = `${randomUUID()}-${file.originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const key = `promotions/${promotionId}/${slot}-${storedName}`;
  return putObject({ key, body: file.buffer, contentType: file.mimeType }).then(() => key);
}

export async function listPromotions(placement?: PromotionPlacement) {
  return prisma.promotion.findMany({
    where: placement ? { placement } : undefined,
    orderBy: [{ active: 'desc' }, { priority: 'desc' }, { createdAt: 'desc' }],
  });
}

export async function getPromotion(id: string) {
  const promotion = await prisma.promotion.findUnique({ where: { id } });
  if (!promotion) throw new NotFoundError('Promotion not found');
  return promotion;
}

export async function createPromotion(
  dto: CreatePromotionInput,
  desktopImage: UploadedImage,
  mobileImage: UploadedImage | null,
  createdByUserId: string,
  auditCtx: AuditContext,
) {
  const id = randomUUID();
  const desktopImageKey = await storeImage(id, 'desktop', desktopImage);
  const mobileImageKey = mobileImage ? await storeImage(id, 'mobile', mobileImage) : null;

  const { startAt, endAt, ...rest } = dto;
  const promotion = await prisma.promotion.create({
    data: {
      id,
      ...rest,
      startAt: new Date(startAt),
      endAt: new Date(endAt),
      desktopImageKey,
      mobileImageKey,
      createdByUserId,
    },
  });

  await recordAuditEvent(auditCtx, {
    eventType: 'PROMOTION',
    action: 'CREATED',
    resourceType: 'Promotion',
    resourceId: promotion.id,
    metadata: { placement: promotion.placement, title: promotion.title },
  });
  return promotion;
}

export async function updatePromotion(
  id: string,
  dto: UpdatePromotionInput,
  desktopImage: UploadedImage | null,
  mobileImage: UploadedImage | null,
  auditCtx: AuditContext,
) {
  const existing = await getPromotion(id);

  const desktopImageKey = desktopImage ? await storeImage(id, 'desktop', desktopImage) : undefined;
  const mobileImageKey = mobileImage ? await storeImage(id, 'mobile', mobileImage) : undefined;

  const { startAt, endAt, ...rest } = dto;
  const promotion = await prisma.promotion.update({
    where: { id },
    data: {
      ...rest,
      ...(startAt ? { startAt: new Date(startAt) } : {}),
      ...(endAt ? { endAt: new Date(endAt) } : {}),
      ...(desktopImageKey ? { desktopImageKey } : {}),
      ...(mobileImageKey ? { mobileImageKey } : {}),
    },
  });

  // Replace-then-delete, not delete-then-replace — a failed upload above
  // would otherwise leave the promotion with a dangling storage key.
  if (desktopImageKey) await deleteObject(existing.desktopImageKey);
  if (mobileImageKey && existing.mobileImageKey) await deleteObject(existing.mobileImageKey);

  await recordAuditEvent(auditCtx, {
    eventType: 'PROMOTION',
    action: 'UPDATED',
    resourceType: 'Promotion',
    resourceId: id,
    metadata: { fields: Object.keys(dto) },
  });
  return promotion;
}

export async function removePromotion(id: string, auditCtx: AuditContext) {
  const promotion = await getPromotion(id);
  await prisma.promotion.delete({ where: { id } });
  await deleteObject(promotion.desktopImageKey);
  if (promotion.mobileImageKey) await deleteObject(promotion.mobileImageKey);
  await recordAuditEvent(auditCtx, { eventType: 'PROMOTION', action: 'DELETED', resourceType: 'Promotion', resourceId: id });
}

export interface ServedPromotion {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  ctaLabel: string | null;
  ctaHref: string | null;
  desktopImageUrl: string;
  mobileImageUrl: string | null;
}

// Public/patient-facing — no admin gate. Filters to what's actually live
// right now for this viewer, per docs/PORTAL-UX-SPEC.md's "no active
// promotion in a placement -> the placement simply doesn't render" empty
// state (never a placeholder graphic).
//
// Impression/click counters exist on the model (docs/ENTERPRISE-DATA-MODEL
// -CHANGES.md §3) but are deliberately not incremented yet — the doc
// itself sanctions shipping without them first ("a promotion without click
// tracking is still a complete, honest feature") rather than wiring up a
// counter that would need request-level dedup to mean anything.
export async function activePromotionsForPlacement(
  placement: PromotionPlacement,
  viewer: { city?: string; languages?: string[] } = {},
  limit = 3,
): Promise<ServedPromotion[]> {
  const now = new Date();
  const candidates = await prisma.promotion.findMany({
    where: { placement, active: true, startAt: { lte: now }, endAt: { gte: now } },
    orderBy: [{ priority: 'desc' }, { createdAt: 'desc' }],
  });

  const matched = candidates.filter((p) => {
    const locationOk = p.targetLocations.length === 0 || (viewer.city ? p.targetLocations.includes(viewer.city) : false);
    const languageOk = p.targetLanguages.length === 0 || (viewer.languages ?? []).some((l) => p.targetLanguages.includes(l));
    return locationOk && languageOk;
  });

  return Promise.all(
    matched.slice(0, limit).map(async (p) => ({
      id: p.id,
      title: p.title,
      subtitle: p.subtitle,
      description: p.description,
      ctaLabel: p.ctaLabel,
      ctaHref: p.ctaHref,
      // Same-origin proxy routes, not direct signed URLs — STORAGE_ENDPOINT
      // is an in-cluster-only host no browser can reach (lib/storage.ts).
      desktopImageUrl: `/api/v1/public/promotions/${p.id}/image?variant=desktop`,
      mobileImageUrl: p.mobileImageKey ? `/api/v1/public/promotions/${p.id}/image?variant=mobile` : null,
    })),
  );
}

// The image behind a public promotion's desktop/mobile image URL. Same
// active-window gate activePromotionsForPlacement's own query applies
// (active, within startAt/endAt), so the route can't be used to read an
// expired or inactive promotion's image.
export async function publicPromotionImage(id: string, variant: 'desktop' | 'mobile'): Promise<{ storageKey: string }> {
  const now = new Date();
  // Same where-clause as activePromotionsForPlacement's own query — never
  // more permissive than what that listing would actually surface.
  const promotion = await prisma.promotion.findFirst({
    where: { id, active: true, startAt: { lte: now }, endAt: { gte: now } },
    select: { desktopImageKey: true, mobileImageKey: true },
  });
  const storageKey = variant === 'mobile' ? promotion?.mobileImageKey : promotion?.desktopImageKey;
  if (!storageKey) throw new NotFoundError('Image not found');
  return { storageKey };
}
