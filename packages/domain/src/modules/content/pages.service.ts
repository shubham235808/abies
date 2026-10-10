import type { z } from 'zod';
import { prisma } from '../../lib/db';
import { ConflictError, NotFoundError } from '../../lib/errors';
import { recordAuditEvent, type AuditContext } from '../../server/audit';
import type { createContentPageSchema, updateContentPageSchema } from './pages.schemas';

type CreateContentPageInput = z.infer<typeof createContentPageSchema>;
type UpdateContentPageInput = z.infer<typeof updateContentPageSchema>;

export async function listContentPages() {
  return prisma.contentPage.findMany({ orderBy: [{ active: 'desc' }, { slug: 'asc' }] });
}

export async function getContentPage(id: string) {
  const page = await prisma.contentPage.findUnique({ where: { id } });
  if (!page) throw new NotFoundError('Content page not found');
  return page;
}

export async function createContentPage(dto: CreateContentPageInput, auditCtx: AuditContext) {
  const clash = await prisma.contentPage.findUnique({ where: { slug: dto.slug } });
  if (clash) throw new ConflictError(`A page with the slug "${dto.slug}" already exists`);
  const page = await prisma.contentPage.create({ data: dto });
  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: 'CREATED',
    resourceType: 'ContentPage',
    resourceId: page.id,
    metadata: { slug: page.slug },
  });
  return page;
}

export async function updateContentPage(id: string, dto: UpdateContentPageInput, auditCtx: AuditContext) {
  await getContentPage(id);
  const page = await prisma.contentPage.update({ where: { id }, data: dto });
  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: 'UPDATED',
    resourceType: 'ContentPage',
    resourceId: id,
    metadata: { slug: page.slug, fields: Object.keys(dto) },
  });
  return page;
}

export async function removeContentPage(id: string, auditCtx: AuditContext) {
  const page = await getContentPage(id);
  // Counted before the delete because the FK cascade removes these rows —
  // the audit trail should still say a header/footer link went with it.
  const navItemsRemoved = await prisma.navMenuItem.count({ where: { contentPageId: id } });
  await prisma.contentPage.delete({ where: { id } });
  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: 'DELETED',
    resourceType: 'ContentPage',
    resourceId: id,
    metadata: { slug: page.slug, navItemsRemoved },
  });
}

// Public-facing — no admin gate. Unpublished and missing are the same thing
// to a visitor.
export async function activeContentPageBySlug(slug: string) {
  const page = await prisma.contentPage.findUnique({ where: { slug } });
  return page && page.active ? page : null;
}
