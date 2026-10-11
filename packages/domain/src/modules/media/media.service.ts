import { randomUUID } from 'crypto';
import { MediaKind, Prisma, type MediaAsset } from '@prisma/client';
import { prisma } from '../../lib/db';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors';
import { getEnv } from '../../lib/env';
import { assertUploadAllowed, deleteObject, getObjectStream, putObject } from '../../lib/storage';
import { recordAuditEvent, type AuditContext } from '../../server/audit';
import { probeImageDimensions, probeVideoDurationSeconds } from './media-probe';
import { MEDIA_IMAGE_MIME_TYPES, MEDIA_VIDEO_MAX_BYTES, MEDIA_VIDEO_MIME_TYPES, type ListMediaInput } from './media.schemas';

export interface UploadedMediaFile {
  originalName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
}

function kindFor(mimeType: string): MediaKind {
  if (MEDIA_IMAGE_MIME_TYPES.has(mimeType)) return MediaKind.IMAGE;
  if (MEDIA_VIDEO_MIME_TYPES.has(mimeType)) return MediaKind.VIDEO;
  throw new BadRequestError(`Unsupported file type: ${mimeType || 'unknown'}. Upload a JPEG, PNG or WebP image, or an MP4 or WebM video.`);
}

export function mediaFileUrl(id: string): string {
  return `/api/v1/admin/media/${id}/file`;
}

function served(asset: MediaAsset) {
  return { ...asset, fileUrl: mediaFileUrl(asset.id) };
}

export type ServedMediaAsset = ReturnType<typeof served>;

export async function uploadMediaAsset(file: UploadedMediaFile, uploadedByUserId: string, auditCtx: AuditContext) {
  const kind = kindFor(file.mimeType);
  try {
    assertUploadAllowed(
      { mimetype: file.mimeType, size: file.size, buffer: file.buffer },
      kind === MediaKind.IMAGE
        ? { allowedMimeTypes: MEDIA_IMAGE_MIME_TYPES, maxBytes: getEnv().UPLOAD_MAX_BYTES }
        : { allowedMimeTypes: MEDIA_VIDEO_MIME_TYPES, maxBytes: MEDIA_VIDEO_MAX_BYTES },
    );
  } catch (error) {
    throw new BadRequestError(error instanceof Error ? error.message : 'File rejected');
  }

  const id = randomUUID();
  const storedName = `${randomUUID()}-${file.originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const storageKey = `media/${id}/${storedName}`;
  const dimensions = kind === MediaKind.IMAGE ? probeImageDimensions(file.mimeType, file.buffer) : null;

  await putObject({ key: storageKey, body: file.buffer, contentType: file.mimeType });
  let asset: MediaAsset;
  try {
    asset = await prisma.mediaAsset.create({
      data: {
        id,
        storageKey,
        originalName: file.originalName.slice(0, 255),
        mimeType: file.mimeType,
        kind,
        sizeBytes: file.size,
        width: dimensions?.width ?? null,
        height: dimensions?.height ?? null,
        durationSeconds: kind === MediaKind.VIDEO ? probeVideoDurationSeconds(file.mimeType, file.buffer) : null,
        uploadedByUserId,
      },
    });
  } catch (error) {
    // No row means nothing would ever list or delete this object.
    await deleteObject(storageKey).catch(() => {});
    throw error;
  }

  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: 'MEDIA_UPLOADED',
    resourceType: 'MediaAsset',
    resourceId: asset.id,
    metadata: { kind, mimeType: asset.mimeType, sizeBytes: asset.sizeBytes },
  });
  return served(asset);
}

export async function listMediaAssets(query: ListMediaInput) {
  const where: Prisma.MediaAssetWhereInput = {
    ...(query.kind ? { kind: query.kind } : {}),
    ...(query.q ? { originalName: { contains: query.q, mode: 'insensitive' } } : {}),
  };
  const [items, total] = await Promise.all([
    prisma.mediaAsset.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
    }),
    prisma.mediaAsset.count({ where }),
  ]);
  return { items: items.map(served), total, page: query.page, pageSize: query.pageSize };
}

export async function getMediaAsset(id: string) {
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset) throw new NotFoundError('Media asset not found');
  return asset;
}

// For modules that reference a library asset by id: confirms it exists and
// is the right kind before the reference is written.
export async function requireMediaAsset(id: string, kind: MediaKind) {
  const asset = await prisma.mediaAsset.findUnique({ where: { id } });
  if (!asset) throw new BadRequestError('The selected media file no longer exists');
  if (asset.kind !== kind) throw new BadRequestError(`The selected media file is not ${kind === MediaKind.IMAGE ? 'an image' : 'a video'}`);
  return asset;
}

async function referenceCount(id: string): Promise<number> {
  return prisma.testimonial.count({ where: { OR: [{ photoAssetId: id }, { videoAssetId: id }] } });
}

// Hard delete, row and object together — but only when nothing references
// the asset. Leaving the object behind ("removed from the library only")
// would make it unreachable garbage, since the library is the only index
// of these keys. The Restrict FKs are the backstop for a reference written
// between the count and the delete.
export async function deleteMediaAsset(id: string, auditCtx: AuditContext) {
  const asset = await getMediaAsset(id);
  const inUse = await referenceCount(id);
  if (inUse > 0) {
    throw new ConflictError(`This file is still used by ${inUse} testimonial${inUse === 1 ? '' : 's'}. Remove it there first.`);
  }
  try {
    await prisma.mediaAsset.delete({ where: { id } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2003') {
      throw new ConflictError('This file is now in use elsewhere. Remove it there first.');
    }
    throw error;
  }
  await deleteObject(asset.storageKey);
  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: 'MEDIA_DELETED',
    resourceType: 'MediaAsset',
    resourceId: id,
    metadata: { originalName: asset.originalName },
  });
}

const SINGLE_RANGE = /^bytes=(\d*)-(\d*)$/;

// Serves a library object same-origin, with Range support. Same-origin
// rather than a redirect to a signed URL: every app's CSP only allows
// 'self' for images and media, and the signed URL's host is the storage
// endpoint the API talks to, not necessarily one a browser can reach.
export async function mediaFileResponse(
  asset: Pick<MediaAsset, 'storageKey' | 'mimeType' | 'sizeBytes'>,
  rangeHeader: string | null,
  cacheControl: string,
): Promise<Response> {
  const size = asset.sizeBytes;
  const match = rangeHeader ? SINGLE_RANGE.exec(rangeHeader.trim()) : null;
  let range: string | undefined;
  if (match && (match[1] || match[2])) {
    const start = match[1] ? Number(match[1]) : Math.max(0, size - Number(match[2]));
    const end = match[1] && match[2] ? Math.min(Number(match[2]), size - 1) : size - 1;
    if (start >= size || start > end) {
      return new Response(null, { status: 416, headers: { 'content-range': `bytes */${size}` } });
    }
    range = `bytes=${start}-${end}`;
  }

  const object = await getObjectStream(asset.storageKey, range);
  const headers = new Headers({
    'content-type': asset.mimeType,
    'accept-ranges': 'bytes',
    'cache-control': cacheControl,
  });
  if (object.contentLength !== undefined) headers.set('content-length', String(object.contentLength));
  if (range && object.contentRange) headers.set('content-range', object.contentRange);
  return new Response(object.body, { status: range ? 206 : 200, headers });
}
