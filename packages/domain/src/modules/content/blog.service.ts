import { randomUUID } from 'crypto';
import type { z } from 'zod';
import { prisma } from '../../lib/db';
import { ConflictError, NotFoundError } from '../../lib/errors';
import { assertUploadAllowed, deleteObject, putObject } from '../../lib/storage';
import { recordAuditEvent, type AuditContext } from '../../server/audit';
import type { createBlogPostSchema, updateBlogPostSchema } from './blog.schemas';
import type { UploadedImage } from './testimonials.service';

type CreateBlogPostInput = z.infer<typeof createBlogPostSchema>;
type UpdateBlogPostInput = z.infer<typeof updateBlogPostSchema>;

const IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

function storeCoverImage(postId: string, file: UploadedImage): Promise<string> {
  assertUploadAllowed({ mimetype: file.mimeType, size: file.size, buffer: file.buffer }, { allowedMimeTypes: IMAGE_MIME_TYPES });
  const storedName = `${randomUUID()}-${file.originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const key = `blog/${postId}/${storedName}`;
  return putObject({ key, body: file.buffer, contentType: file.mimeType }).then(() => key);
}

export async function listBlogPosts() {
  // Drafts (null publishedAt) first so unfinished work sits at the top of
  // the admin list, then newest published.
  return prisma.blogPost.findMany({ orderBy: [{ publishedAt: { sort: 'desc', nulls: 'first' } }, { createdAt: 'desc' }] });
}

export async function getBlogPost(id: string) {
  const post = await prisma.blogPost.findUnique({ where: { id } });
  if (!post) throw new NotFoundError('Blog post not found');
  return post;
}

export async function createBlogPost(
  dto: CreateBlogPostInput,
  coverImage: UploadedImage | null,
  createdByUserId: string,
  auditCtx: AuditContext,
) {
  const clash = await prisma.blogPost.findUnique({ where: { slug: dto.slug } });
  if (clash) throw new ConflictError(`A blog post with the slug "${dto.slug}" already exists`);
  const id = randomUUID();
  const coverImageKey = coverImage ? await storeCoverImage(id, coverImage) : null;
  const post = await prisma.blogPost.create({ data: { id, ...dto, coverImageKey, createdByUserId } });
  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: 'CREATED',
    resourceType: 'BlogPost',
    resourceId: post.id,
    metadata: { slug: post.slug, published: post.publishedAt !== null },
  });
  return post;
}

export async function updateBlogPost(
  id: string,
  dto: UpdateBlogPostInput,
  coverImage: UploadedImage | null,
  auditCtx: AuditContext,
) {
  const existing = await getBlogPost(id);
  const { clearCoverImage, ...fields } = dto;
  const newKey = coverImage ? await storeCoverImage(id, coverImage) : undefined;
  const coverImageKey = newKey ?? (clearCoverImage ? null : undefined);
  const post = await prisma.blogPost.update({
    where: { id },
    data: { ...fields, ...(coverImageKey !== undefined ? { coverImageKey } : {}) },
  });

  // Replace-then-delete, same ordering as updateTestimonial/updatePageSeo.
  if (coverImageKey !== undefined && existing.coverImageKey) await deleteObject(existing.coverImageKey);

  // Publishing and unpublishing get their own audit actions — "who took
  // this post live / down, and when" is the question the trail is for.
  const wasPublished = existing.publishedAt !== null;
  const isPublished = post.publishedAt !== null;
  const action = !wasPublished && isPublished ? 'PUBLISHED' : wasPublished && !isPublished ? 'UNPUBLISHED' : 'UPDATED';
  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action,
    resourceType: 'BlogPost',
    resourceId: id,
    metadata: { slug: post.slug, fields: Object.keys(dto), coverImageReplaced: Boolean(newKey) },
  });
  return post;
}

export async function removeBlogPost(id: string, auditCtx: AuditContext) {
  const post = await getBlogPost(id);
  await prisma.blogPost.delete({ where: { id } });
  if (post.coverImageKey) await deleteObject(post.coverImageKey);
  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: 'DELETED',
    resourceType: 'BlogPost',
    resourceId: id,
    metadata: { slug: post.slug },
  });
}

export interface ServedBlogPost {
  id: string;
  slug: string;
  title: string;
  excerpt: string;
  authorName: string;
  publishedAt: Date;
  updatedAt: Date;
  coverImageUrl: string | null;
}

// A future publishedAt is a scheduled post: it stays hidden until then,
// with no job needed to flip it live.
function visibleWhere(now: Date) {
  return { active: true, publishedAt: { not: null, lte: now } };
}

// Public-facing — no admin gate, read on every request. Newest first.
export async function publishedBlogPosts(): Promise<ServedBlogPost[]> {
  const rows = await prisma.blogPost.findMany({
    where: visibleWhere(new Date()),
    orderBy: [{ publishedAt: 'desc' }, { createdAt: 'desc' }],
    omit: { body: true },
  });
  return Promise.all(
    rows.map(async (p) => ({
      id: p.id,
      slug: p.slug,
      title: p.title,
      excerpt: p.excerpt,
      authorName: p.authorName,
      publishedAt: p.publishedAt as Date,
      updatedAt: p.updatedAt,
      // Same-origin proxy route, not a direct signed URL — STORAGE_ENDPOINT
      // is an in-cluster-only host no browser can reach (lib/storage.ts).
      coverImageUrl: p.coverImageKey ? `/api/v1/public/blog/${p.slug}/cover` : null,
    })),
  );
}

// Public-facing. Draft, hidden, scheduled and missing are all the same thing
// to a visitor: null.
export async function publishedBlogPostBySlug(slug: string): Promise<(ServedBlogPost & { body: string }) | null> {
  const p = await prisma.blogPost.findFirst({ where: { slug, ...visibleWhere(new Date()) } });
  if (!p) return null;
  return {
    id: p.id,
    slug: p.slug,
    title: p.title,
    excerpt: p.excerpt,
    body: p.body,
    authorName: p.authorName,
    publishedAt: p.publishedAt as Date,
    updatedAt: p.updatedAt,
    coverImageUrl: p.coverImageKey ? `/api/v1/public/blog/${p.slug}/cover` : null,
  };
}

// The image behind a published post's coverImageUrl. Same visibleWhere gate
// the two listings above use, keyed by slug since that's what the public
// route already addresses the post by.
export async function publishedBlogPostCover(slug: string): Promise<{ storageKey: string }> {
  const p = await prisma.blogPost.findFirst({ where: { slug, ...visibleWhere(new Date()) }, select: { coverImageKey: true } });
  if (!p?.coverImageKey) throw new NotFoundError('Cover image not found');
  return { storageKey: p.coverImageKey };
}
