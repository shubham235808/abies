import type { z } from 'zod';
import { prisma } from '../../lib/db';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { recordAuditEvent, type AuditContext } from '../../server/audit';
import {
  DEFAULT_NAV_MENUS,
  type NavLink,
  type NavMenuLocationKey,
  type createNavMenuItemSchema,
  type updateNavMenuItemSchema,
} from './nav.schemas';
import { publicPathForContentPage } from './pages.schemas';

type CreateNavMenuItemInput = z.infer<typeof createNavMenuItemSchema>;
type UpdateNavMenuItemInput = z.infer<typeof updateNavMenuItemSchema>;

const ADMIN_INCLUDE = { contentPage: { select: { id: true, slug: true, title: true, active: true } } } as const;

export async function listNavMenuItems() {
  return prisma.navMenuItem.findMany({
    include: ADMIN_INCLUDE,
    orderBy: [{ location: 'asc' }, { priority: 'desc' }, { createdAt: 'asc' }],
  });
}

export async function getNavMenuItem(id: string) {
  const item = await prisma.navMenuItem.findUnique({ where: { id }, include: ADMIN_INCLUDE });
  if (!item) throw new NotFoundError('Navigation item not found');
  return item;
}

async function assertContentPageExists(contentPageId: string) {
  const page = await prisma.contentPage.findUnique({ where: { id: contentPageId }, select: { id: true } });
  if (!page) throw new BadRequestError('The selected content page does not exist');
}

export async function createNavMenuItem(dto: CreateNavMenuItemInput, auditCtx: AuditContext) {
  if (dto.contentPageId) await assertContentPageExists(dto.contentPageId);
  const item = await prisma.navMenuItem.create({
    data: {
      location: dto.location,
      label: dto.label,
      href: dto.href ?? null,
      contentPageId: dto.contentPageId ?? null,
      priority: dto.priority,
      active: dto.active,
    },
    include: ADMIN_INCLUDE,
  });
  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: 'CREATED',
    resourceType: 'NavMenuItem',
    resourceId: item.id,
    metadata: { location: item.location, label: item.label },
  });
  return item;
}

export async function updateNavMenuItem(id: string, dto: UpdateNavMenuItemInput, auditCtx: AuditContext) {
  const existing = await getNavMenuItem(id);
  const href = dto.href !== undefined ? dto.href : existing.href;
  const contentPageId = dto.contentPageId !== undefined ? dto.contentPageId : existing.contentPageId;
  if (Boolean(href) === Boolean(contentPageId)) {
    throw new BadRequestError('A navigation item must have exactly one of a link (href) or a content page');
  }
  if (dto.contentPageId) await assertContentPageExists(dto.contentPageId);

  const item = await prisma.navMenuItem.update({ where: { id }, data: dto, include: ADMIN_INCLUDE });
  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: 'UPDATED',
    resourceType: 'NavMenuItem',
    resourceId: id,
    metadata: { location: item.location, fields: Object.keys(dto) },
  });
  return item;
}

export async function removeNavMenuItem(id: string, auditCtx: AuditContext) {
  const item = await getNavMenuItem(id);
  await prisma.navMenuItem.delete({ where: { id } });
  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: 'DELETED',
    resourceType: 'NavMenuItem',
    resourceId: id,
    metadata: { location: item.location, label: item.label },
  });
}

export interface ServedNavItem extends NavLink {
  key: string;
}

interface NavRowForServing {
  id: string;
  label: string;
  href: string | null;
  active: boolean;
  contentPage: { slug: string; active: boolean } | null;
}

// Pure so the fallback rule is testable without seeding/clearing the shared
// database. "Never configured" (zero rows, active or not) falls back to the
// built-in defaults; "configured but everything switched off" is an admin
// decision and renders empty.
export function resolveNavItems(location: NavMenuLocationKey, rows: readonly NavRowForServing[]): ServedNavItem[] {
  if (rows.length === 0) {
    return DEFAULT_NAV_MENUS[location].map((link) => ({ key: `default:${link.href}`, ...link }));
  }
  return rows.flatMap((row) => {
    if (!row.active) return [];
    if (row.contentPage) {
      if (!row.contentPage.active) return [];
      return [{ key: row.id, label: row.label, href: publicPathForContentPage(row.contentPage.slug) }];
    }
    return row.href ? [{ key: row.id, label: row.label, href: row.href }] : [];
  });
}

// Public-facing — no admin gate, read on every request (no caching), same
// as activePromotionsForPlacement. One query for all requested locations
// since the header and footer each render several.
export async function activeNavMenus<L extends NavMenuLocationKey>(
  locations: readonly L[],
): Promise<Record<L, ServedNavItem[]>> {
  const rows = await prisma.navMenuItem.findMany({
    where: { location: { in: [...locations] } },
    select: { id: true, location: true, label: true, href: true, active: true, contentPage: { select: { slug: true, active: true } } },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });
  const result = {} as Record<L, ServedNavItem[]>;
  for (const location of locations) {
    result[location] = resolveNavItems(
      location,
      rows.filter((r) => r.location === location),
    );
  }
  return result;
}
