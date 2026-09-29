// @vitest-environment node
import { randomInt } from 'crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import {
  activePromotionsForPlacement,
  createPromotion,
  getPromotion,
  listPromotions,
  removePromotion,
  updatePromotion,
  type UploadedImage,
} from '@/modules/promotions/promotions.service';

const createdPromotionIds: string[] = [];
const titleTag = `TEST_PROMO_${randomInt(100000, 999999)}`;

afterAll(async () => {
  const remaining = await prisma.promotion.findMany({ where: { id: { in: createdPromotionIds } } });
  for (const p of remaining) await removePromotion(p.id, {}).catch(() => {});
  await prisma.$disconnect();
});

const fakeImage: UploadedImage = { originalName: 'banner.jpg', mimeType: 'image/jpeg', size: 1024, buffer: Buffer.from('fake-jpeg-bytes') };

function windowNow(offsetStartHours: number, offsetEndHours: number) {
  const now = Date.now();
  return {
    startAt: new Date(now + offsetStartHours * 60 * 60 * 1000).toISOString(),
    endAt: new Date(now + offsetEndHours * 60 * 60 * 1000).toISOString(),
  };
}

describe('promotion CRUD (ENTERPRISE-13)', () => {
  it('creates, lists, updates and removes a promotion', async () => {
    const promotion = await createPromotion(
      {
        title: `${titleTag} create`,
        placement: 'PUBLIC_HOME_HERO',
        priority: 5,
        active: true,
        targetLocations: [],
        targetLanguages: [],
        ...windowNow(-1, 24),
      },
      fakeImage,
      null,
      'admin-user-id',
      {},
    );
    createdPromotionIds.push(promotion.id);
    expect(promotion.desktopImageKey).toContain(`promotions/${promotion.id}/desktop-`);

    const listed = await listPromotions('PUBLIC_HOME_HERO');
    expect(listed.some((p) => p.id === promotion.id)).toBe(true);

    const updated = await updatePromotion(promotion.id, { title: `${titleTag} updated`, priority: 9 }, null, null, {});
    expect(updated.title).toBe(`${titleTag} updated`);
    expect(updated.priority).toBe(9);
    expect(updated.desktopImageKey).toBe(promotion.desktopImageKey);

    await removePromotion(promotion.id, {});
    await expect(getPromotion(promotion.id)).rejects.toThrow(NotFoundError);
    createdPromotionIds.splice(createdPromotionIds.indexOf(promotion.id), 1);
  });

  it('rejects entityType without a matching entityId at the schema layer', async () => {
    const { createPromotionSchema } = await import('@/modules/promotions/promotions.schemas');
    const result = createPromotionSchema.safeParse({
      title: 'x',
      placement: 'PUBLIC_HOME_HERO',
      entityType: 'DOCTOR',
      ...windowNow(0, 1),
    });
    expect(result.success).toBe(false);
  });

  it('rejects a ctaHref that is not a relative path or an https:// URL (ENTERPRISE-15)', async () => {
    const { createPromotionSchema } = await import('@/modules/promotions/promotions.schemas');
    const base = { title: 'x', placement: 'PUBLIC_HOME_HERO' as const, ...windowNow(0, 1) };
    expect(createPromotionSchema.safeParse({ ...base, ctaHref: 'javascript:alert(1)' }).success).toBe(false);
    expect(createPromotionSchema.safeParse({ ...base, ctaHref: 'data:text/html,<script>alert(1)</script>' }).success).toBe(false);
    expect(createPromotionSchema.safeParse({ ...base, ctaHref: '/doctors' }).success).toBe(true);
    expect(createPromotionSchema.safeParse({ ...base, ctaHref: 'https://abies.example/offer' }).success).toBe(true);
  });
});

describe('activePromotionsForPlacement (ENTERPRISE-13)', () => {
  it('serves an active, in-window promotion and excludes an expired one', async () => {
    const active = await createPromotion(
      { title: `${titleTag} active`, placement: 'PATIENT_HOME_HERO', priority: 1, active: true, targetLocations: [], targetLanguages: [], ...windowNow(-1, 24) },
      fakeImage,
      null,
      'admin-user-id',
      {},
    );
    const expired = await createPromotion(
      { title: `${titleTag} expired`, placement: 'PATIENT_HOME_HERO', priority: 1, active: true, targetLocations: [], targetLanguages: [], ...windowNow(-48, -24) },
      fakeImage,
      null,
      'admin-user-id',
      {},
    );
    createdPromotionIds.push(active.id, expired.id);

    const served = await activePromotionsForPlacement('PATIENT_HOME_HERO', {});
    expect(served.some((p) => p.id === active.id)).toBe(true);
    expect(served.some((p) => p.id === expired.id)).toBe(false);
    expect(served.find((p) => p.id === active.id)?.desktopImageUrl).toContain('http');
  });

  it('filters by target city when the promotion sets one', async () => {
    const puneOnly = await createPromotion(
      {
        title: `${titleTag} pune`,
        placement: 'PATIENT_HOME_DIAGNOSTICS',
        priority: 1,
        active: true,
        targetLocations: ['Pune'],
        targetLanguages: [],
        ...windowNow(-1, 24),
      },
      fakeImage,
      null,
      'admin-user-id',
      {},
    );
    createdPromotionIds.push(puneOnly.id);

    const servedForPune = await activePromotionsForPlacement('PATIENT_HOME_DIAGNOSTICS', { city: 'Pune' });
    expect(servedForPune.some((p) => p.id === puneOnly.id)).toBe(true);

    const servedForMumbai = await activePromotionsForPlacement('PATIENT_HOME_DIAGNOSTICS', { city: 'Mumbai' });
    expect(servedForMumbai.some((p) => p.id === puneOnly.id)).toBe(false);

    const servedForAnonymous = await activePromotionsForPlacement('PATIENT_HOME_DIAGNOSTICS', {});
    expect(servedForAnonymous.some((p) => p.id === puneOnly.id)).toBe(false);
  });

  it('does not serve an inactive promotion even inside its date window', async () => {
    const inactive = await createPromotion(
      { title: `${titleTag} inactive`, placement: 'PATIENT_HOME_MEDICINES', priority: 1, active: false, targetLocations: [], targetLanguages: [], ...windowNow(-1, 24) },
      fakeImage,
      null,
      'admin-user-id',
      {},
    );
    createdPromotionIds.push(inactive.id);

    const served = await activePromotionsForPlacement('PATIENT_HOME_MEDICINES', {});
    expect(served.some((p) => p.id === inactive.id)).toBe(false);
  });
});
