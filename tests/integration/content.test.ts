// @vitest-environment node
import { randomInt } from 'crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@abies/domain/lib/db';
import { NotFoundError } from '@abies/domain/lib/errors';
import { activeAboutPage, getAboutPage, upsertAboutPage } from '@abies/domain/modules/content/about.service';
import {
  activeFaqEntries,
  createFaqEntry,
  getFaqEntry,
  listFaqEntries,
  removeFaqEntry,
  updateFaqEntry,
} from '@abies/domain/modules/content/faq.service';
import {
  activeTestimonials,
  createTestimonial,
  getTestimonial,
  listTestimonials,
  removeTestimonial,
  updateTestimonial,
  type UploadedImage,
} from '@abies/domain/modules/content/testimonials.service';

const tag = `TEST_CONTENT_${randomInt(100000, 999999)}`;
const createdFaqIds: string[] = [];
const createdTestimonialIds: string[] = [];

afterAll(async () => {
  await prisma.contentPage.deleteMany({ where: { slug: 'about-us', title: { startsWith: tag } } });
  for (const id of createdFaqIds) await removeFaqEntry(id, {}).catch(() => {});
  for (const id of createdTestimonialIds) await removeTestimonial(id, {}).catch(() => {});
  await prisma.$disconnect();
});

// assertUploadAllowed (packages/domain/src/lib/storage.ts) checks the JPEG
// magic bytes, not just the declared mimeType — matches tests/integration/
// promotions.test.ts's fakeImage.
const fakePhoto: UploadedImage = {
  originalName: 'author.jpg',
  mimeType: 'image/jpeg',
  size: 1024,
  buffer: Buffer.concat([Buffer.from([0xff, 0xd8, 0xff]), Buffer.from('fake-jpeg-bytes')]),
};

describe('About Us page (EXPANSION-5 content pass)', () => {
  it('upserts a singleton page keyed to the fixed about-us slug', async () => {
    const created = await upsertAboutPage({ title: `${tag} title`, body: `${tag} body`, active: true }, {});
    expect(created.slug).toBe('about-us');

    const fetched = await getAboutPage();
    expect(fetched?.id).toBe(created.id);

    const updated = await upsertAboutPage({ title: `${tag} updated`, body: `${tag} body 2`, active: true }, {});
    expect(updated.id).toBe(created.id);
    expect(updated.title).toBe(`${tag} updated`);
  });

  it('serves the page publicly only while active', async () => {
    await upsertAboutPage({ title: `${tag} active`, body: `${tag} body`, active: true }, {});
    expect((await activeAboutPage())?.title).toBe(`${tag} active`);

    await upsertAboutPage({ title: `${tag} inactive`, body: `${tag} body`, active: false }, {});
    expect(await activeAboutPage()).toBeNull();
  });
});

describe('FAQ entries (EXPANSION-5 content pass)', () => {
  it('creates, lists, updates and removes an entry', async () => {
    const entry = await createFaqEntry({ question: `${tag} q`, answer: `${tag} a`, priority: 1, active: true }, {});
    createdFaqIds.push(entry.id);

    const listed = await listFaqEntries();
    expect(listed.some((f) => f.id === entry.id)).toBe(true);

    const updated = await updateFaqEntry(entry.id, { answer: `${tag} updated answer` }, {});
    expect(updated.answer).toBe(`${tag} updated answer`);

    await removeFaqEntry(entry.id, {});
    await expect(getFaqEntry(entry.id)).rejects.toThrow(NotFoundError);
    createdFaqIds.splice(createdFaqIds.indexOf(entry.id), 1);
  });

  it('serves only active entries publicly, ordered by priority descending', async () => {
    const low = await createFaqEntry({ question: `${tag} low`, answer: 'a', priority: 1, active: true }, {});
    const high = await createFaqEntry({ question: `${tag} high`, answer: 'a', priority: 10, active: true }, {});
    const inactive = await createFaqEntry({ question: `${tag} inactive`, answer: 'a', priority: 20, active: false }, {});
    createdFaqIds.push(low.id, high.id, inactive.id);

    const served = await activeFaqEntries();
    const ourIds = served.filter((e) => [low.id, high.id, inactive.id].includes(e.id)).map((e) => e.id);
    expect(ourIds).toEqual([high.id, low.id]);
  });
});

describe('Testimonials (EXPANSION-5 content pass)', () => {
  it('creates with a photo, lists, updates without touching the photo, and removes', async () => {
    const testimonial = await createTestimonial(
      { authorName: `${tag} author`, quote: `${tag} quote`, priority: 0, active: true },
      fakePhoto,
      'admin-user-id',
      {},
    );
    createdTestimonialIds.push(testimonial.id);
    expect(testimonial.photoKey).toContain(`testimonials/${testimonial.id}/`);

    const listed = await listTestimonials();
    expect(listed.some((t) => t.id === testimonial.id)).toBe(true);

    const updated = await updateTestimonial(testimonial.id, { authorRole: 'Patient, Pune' }, null, {});
    expect(updated.authorRole).toBe('Patient, Pune');
    expect(updated.photoKey).toBe(testimonial.photoKey);

    await removeTestimonial(testimonial.id, {});
    await expect(getTestimonial(testimonial.id)).rejects.toThrow(NotFoundError);
    createdTestimonialIds.splice(createdTestimonialIds.indexOf(testimonial.id), 1);
  });

  it('creates without a photo and serves active testimonials with a signed photoUrl only when one exists', async () => {
    const withoutPhoto = await createTestimonial(
      { authorName: `${tag} no-photo`, quote: `${tag} quote 2`, rating: 5, priority: 5, active: true },
      null,
      'admin-user-id',
      {},
    );
    createdTestimonialIds.push(withoutPhoto.id);
    expect(withoutPhoto.photoKey).toBeNull();

    const served = await activeTestimonials(20);
    const served1 = served.find((t) => t.id === withoutPhoto.id);
    expect(served1?.photoUrl).toBeNull();
    expect(served1?.rating).toBe(5);
  });

  it('does not serve an inactive testimonial', async () => {
    const inactive = await createTestimonial(
      { authorName: `${tag} inactive`, quote: `${tag} quote 3`, priority: 0, active: false },
      null,
      'admin-user-id',
      {},
    );
    createdTestimonialIds.push(inactive.id);

    const served = await activeTestimonials(50);
    expect(served.some((t) => t.id === inactive.id)).toBe(false);
  });
});
