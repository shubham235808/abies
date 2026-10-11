import { z } from 'zod';

export const MEDIA_KINDS = ['IMAGE', 'VIDEO'] as const;

// Images: the same JPEG/PNG the other admin upload paths take, plus WebP
// (already accepted for product images). Their size cap is UPLOAD_MAX_BYTES,
// the same default testimonial/promotion photos use.
export const MEDIA_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MEDIA_VIDEO_MIME_TYPES = new Set(['video/mp4', 'video/webm']);

// Sized for short clips (a testimonial, a promo loop), not long-form video:
// the route handler holds the whole upload in memory before it reaches
// storage. Raising it also means raising experimental.proxyClientMaxBodySize
// in apps/platform-api/next.config.mjs (Next silently truncates bodies over
// that limit when a proxy is active) and the /api/v1/admin/media
// client_max_body_size in infra/nginx/abies.conf.
export const MEDIA_VIDEO_MAX_BYTES = 50 * 1024 * 1024;

export const listMediaSchema = z.object({
  q: z.string().trim().max(120).optional(),
  kind: z.enum(MEDIA_KINDS).optional(),
  page: z.coerce.number().int().min(1).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(24),
});

export type ListMediaInput = z.infer<typeof listMediaSchema>;
