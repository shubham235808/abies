import type { z } from 'zod';
import { prisma } from '../../lib/db';
import { recordAuditEvent, type AuditContext } from '../../server/audit';
import type { upsertAboutPageSchema } from './about.schemas';

const ABOUT_US_SLUG = 'about-us';

export async function getAboutPage() {
  return prisma.contentPage.findUnique({ where: { slug: ABOUT_US_SLUG } });
}

// Public-facing — no admin gate. Mirrors activePromotionsForPlacement's
// "not live yet -> renders nothing" rule: no row yet, or an inactive row,
// both mean the public page shows its own honest empty state rather than
// stale/placeholder copy.
export async function activeAboutPage() {
  const page = await prisma.contentPage.findUnique({ where: { slug: ABOUT_US_SLUG } });
  return page && page.active ? page : null;
}

export async function upsertAboutPage(dto: z.infer<typeof upsertAboutPageSchema>, auditCtx: AuditContext) {
  const existing = await prisma.contentPage.findUnique({ where: { slug: ABOUT_US_SLUG } });
  const page = await prisma.contentPage.upsert({
    where: { slug: ABOUT_US_SLUG },
    create: { slug: ABOUT_US_SLUG, ...dto },
    update: dto,
  });
  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: existing ? 'UPDATED' : 'CREATED',
    resourceType: 'ContentPage',
    resourceId: page.id,
    metadata: { slug: page.slug },
  });
  return page;
}
