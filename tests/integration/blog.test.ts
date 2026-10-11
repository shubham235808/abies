// @vitest-environment node
import { randomInt } from 'crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@abies/domain/lib/db';
import { ConflictError, NotFoundError } from '@abies/domain/lib/errors';
import { createBlogPostSchema, publicPathForBlogPost, updateBlogPostSchema } from '@abies/domain/modules/content/blog.schemas';
import {
  createBlogPost,
  getBlogPost,
  listBlogPosts,
  publishedBlogPostBySlug,
  publishedBlogPosts,
  removeBlogPost,
  updateBlogPost,
} from '@abies/domain/modules/content/blog.service';
import type { UploadedImage } from '@abies/domain/modules/content/testimonials.service';

const n = randomInt(100000, 999999);
const slug = (suffix: string) => `test-blog-${n}-${suffix}`;
const createdPostIds: string[] = [];

afterAll(async () => {
  for (const id of createdPostIds) await removeBlogPost(id, {}).catch(() => {});
  await prisma.$disconnect();
});

// Same magic-byte-valid fake JPEG as content.test.ts / promotions.test.ts.
const fakeImage: UploadedImage = {
  originalName: 'cover.jpg',
  mimeType: 'image/jpeg',
  size: 1024,
  buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('fake-jpeg-bytes')]),
};

const HOUR = 60 * 60 * 1000;

async function newPost(suffix: string, overrides: { publishedAt?: Date | null; active?: boolean } = {}, cover: UploadedImage | null = null) {
  const post = await createBlogPost(
    {
      slug: slug(suffix),
      title: `Post ${suffix}`,
      excerpt: `Summary for ${suffix}`,
      body: `Body for ${suffix}\n\nSecond paragraph.`,
      authorName: 'Dr. Test Author',
      publishedAt: overrides.publishedAt ?? null,
      active: overrides.active ?? true,
    },
    cover,
    'admin-user-id',
    {},
  );
  createdPostIds.push(post.id);
  return post;
}

describe('Blog posts — admin CRUD', () => {
  it('creates a draft, lists, updates and removes it, auditing each write', async () => {
    const post = await newPost('crud');
    expect(post.publishedAt).toBeNull();
    expect(post.createdByUserId).toBe('admin-user-id');
    expect((await listBlogPosts()).some((p) => p.id === post.id)).toBe(true);

    const updated = await updateBlogPost(post.id, { title: 'Renamed', authorName: 'Another Author' }, null, {});
    expect(updated.title).toBe('Renamed');
    expect(updated.authorName).toBe('Another Author');
    expect(updated.slug).toBe(post.slug);

    await removeBlogPost(post.id, {});
    await expect(getBlogPost(post.id)).rejects.toThrow(NotFoundError);
    createdPostIds.splice(createdPostIds.indexOf(post.id), 1);

    const actions = (await prisma.auditEvent.findMany({ where: { resourceId: post.id, resourceType: 'BlogPost' } })).map((e) => e.action);
    expect(actions.sort()).toEqual(['CREATED', 'DELETED', 'UPDATED']);
  });

  it('records publish and unpublish as their own audit actions', async () => {
    const post = await newPost('publish-audit');
    const published = await updateBlogPost(post.id, { publishedAt: new Date() }, null, {});
    expect(published.publishedAt).not.toBeNull();
    const unpublished = await updateBlogPost(post.id, { publishedAt: null }, null, {});
    expect(unpublished.publishedAt).toBeNull();

    const events = await prisma.auditEvent.findMany({
      where: { resourceId: post.id, resourceType: 'BlogPost' },
      orderBy: { createdAt: 'asc' },
    });
    expect(events.map((e) => e.action)).toEqual(['CREATED', 'PUBLISHED', 'UNPUBLISHED']);
    expect(events[1]?.metadata).toMatchObject({ slug: post.slug, fields: ['publishedAt'] });
  });

  it('rejects a duplicate slug and a malformed slug, and does not allow the slug to change', async () => {
    const post = await newPost('dup');
    const base = { title: 't', excerpt: 'e', body: 'b', authorName: 'a' };
    await expect(createBlogPost({ ...base, slug: post.slug, publishedAt: null, active: true }, null, 'u', {})).rejects.toThrow(ConflictError);
    expect(createBlogPostSchema.safeParse({ ...base, slug: 'Bad Slug' }).success).toBe(false);
    expect(createBlogPostSchema.safeParse({ ...base, slug: 'bad--slug' }).success).toBe(false);
    expect(updateBlogPostSchema.parse({ slug: 'new-slug', title: 'x' })).not.toHaveProperty('slug');
  });

  it('parses publishedAt from the ISO string the multipart payload carries, defaulting to draft', () => {
    const base = { slug: 'ok-slug', title: 't', excerpt: 'e', body: 'b', authorName: 'a' };
    expect(createBlogPostSchema.parse(base).publishedAt).toBeNull();
    const iso = '2026-10-01T04:30:00.000Z';
    expect(createBlogPostSchema.parse({ ...base, publishedAt: iso }).publishedAt?.toISOString()).toBe(iso);
    expect(updateBlogPostSchema.parse({ publishedAt: null }).publishedAt).toBeNull();
    expect(updateBlogPostSchema.parse({}).publishedAt).toBeUndefined();
    expect(createBlogPostSchema.safeParse({ ...base, publishedAt: 'not a date' }).success).toBe(false);
  });

  it('stores a cover image, keeps it on an unrelated edit, replaces it, and clears it', async () => {
    const post = await newPost('cover', {}, fakeImage);
    expect(post.coverImageKey).toContain(`blog/${post.id}/`);

    const untouched = await updateBlogPost(post.id, { excerpt: 'New summary' }, null, {});
    expect(untouched.coverImageKey).toBe(post.coverImageKey);

    const replaced = await updateBlogPost(post.id, {}, fakeImage, {});
    expect(replaced.coverImageKey).toContain(`blog/${post.id}/`);
    expect(replaced.coverImageKey).not.toBe(post.coverImageKey);

    const cleared = await updateBlogPost(post.id, { clearCoverImage: true }, null, {});
    expect(cleared.coverImageKey).toBeNull();

    const replacedEvent = await prisma.auditEvent.findFirst({
      where: { resourceId: post.id, resourceType: 'BlogPost', metadata: { path: ['coverImageReplaced'], equals: true } },
    });
    expect(replacedEvent).not.toBeNull();
  });
});

describe('Blog posts — public serving', () => {
  it('serves only active posts whose publish date has passed, newest first', async () => {
    const older = await newPost('older', { publishedAt: new Date(Date.now() - 2 * HOUR) });
    const newer = await newPost('newer', { publishedAt: new Date(Date.now() - HOUR) });
    const draft = await newPost('draft');
    const scheduled = await newPost('scheduled', { publishedAt: new Date(Date.now() + 24 * HOUR) });
    const hidden = await newPost('hidden', { publishedAt: new Date(Date.now() - HOUR), active: false });
    const ids = [older.id, newer.id, draft.id, scheduled.id, hidden.id];

    const served = await publishedBlogPosts();
    expect(served.filter((p) => ids.includes(p.id)).map((p) => p.id)).toEqual([newer.id, older.id]);
    expect(served.find((p) => p.id === newer.id)).not.toHaveProperty('body');

    expect((await publishedBlogPostBySlug(newer.slug))?.id).toBe(newer.id);
    expect(await publishedBlogPostBySlug(draft.slug)).toBeNull();
    expect(await publishedBlogPostBySlug(scheduled.slug)).toBeNull();
    expect(await publishedBlogPostBySlug(hidden.slug)).toBeNull();
    expect(await publishedBlogPostBySlug(slug('never-created'))).toBeNull();
  });

  it('serves the body, byline and a signed cover URL on the detail lookup, and goes dark on unpublish', async () => {
    const post = await newPost('detail', { publishedAt: new Date(Date.now() - HOUR) }, fakeImage);
    const served = await publishedBlogPostBySlug(post.slug);
    expect(served).toMatchObject({ title: post.title, body: post.body, authorName: 'Dr. Test Author', excerpt: post.excerpt });
    expect(served?.coverImageUrl).toBeTruthy();

    const listed = (await publishedBlogPosts()).find((p) => p.id === post.id);
    expect(listed?.coverImageUrl).toBeTruthy();

    await updateBlogPost(post.id, { publishedAt: null }, null, {});
    expect(await publishedBlogPostBySlug(post.slug)).toBeNull();
  });

  it('maps a slug to its public /blog path', () => {
    expect(publicPathForBlogPost('ayurveda-for-sleep')).toBe('/blog/ayurveda-for-sleep');
  });
});
