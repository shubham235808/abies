import type { z } from 'zod';
import { prisma } from '../../lib/db';
import { recordAuditEvent, type AuditContext } from '../../server/audit';
import type { upsertAboutPageSchema } from './about.schemas';
import { DEFAULT_CONTENT_LANGUAGE, type ContentLanguage } from './languages';
import { activeContentPageBySlug } from './pages.service';

const ABOUT_US_SLUG = 'about-us';
const ABOUT_US_KEY = { slug_language: { slug: ABOUT_US_SLUG, language: DEFAULT_CONTENT_LANGUAGE } };

export async function getAboutPage() {
  return prisma.contentPage.findUnique({ where: ABOUT_US_KEY });
}

// Public-facing — no admin gate. Mirrors activePromotionsForPlacement's
// "not live yet -> renders nothing" rule: no row yet, or an inactive row,
// both mean the public page shows its own honest empty state rather than
// stale/placeholder copy.
export async function activeAboutPage(language: ContentLanguage = DEFAULT_CONTENT_LANGUAGE) {
  return activeContentPageBySlug(ABOUT_US_SLUG, language);
}

export async function upsertAboutPage(dto: z.infer<typeof upsertAboutPageSchema>, auditCtx: AuditContext) {
  const existing = await prisma.contentPage.findUnique({ where: ABOUT_US_KEY });
  const page = await prisma.contentPage.upsert({
    where: ABOUT_US_KEY,
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
