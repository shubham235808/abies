import type { z } from 'zod';
import { prisma } from '../../lib/db';
import { NotFoundError } from '../../lib/errors';
import { recordAuditEvent, type AuditContext } from '../../server/audit';
import type { createFaqEntrySchema, updateFaqEntrySchema } from './faq.schemas';

type CreateFaqEntryInput = z.infer<typeof createFaqEntrySchema>;
type UpdateFaqEntryInput = z.infer<typeof updateFaqEntrySchema>;

export async function listFaqEntries() {
  return prisma.faqEntry.findMany({ orderBy: [{ active: 'desc' }, { priority: 'desc' }, { createdAt: 'asc' }] });
}

export async function getFaqEntry(id: string) {
  const entry = await prisma.faqEntry.findUnique({ where: { id } });
  if (!entry) throw new NotFoundError('FAQ entry not found');
  return entry;
}

export async function createFaqEntry(dto: CreateFaqEntryInput, auditCtx: AuditContext) {
  const entry = await prisma.faqEntry.create({ data: dto });
  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: 'CREATED',
    resourceType: 'FaqEntry',
    resourceId: entry.id,
    metadata: { question: entry.question },
  });
  return entry;
}

export async function updateFaqEntry(id: string, dto: UpdateFaqEntryInput, auditCtx: AuditContext) {
  await getFaqEntry(id);
  const entry = await prisma.faqEntry.update({ where: { id }, data: dto });
  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: 'UPDATED',
    resourceType: 'FaqEntry',
    resourceId: id,
    metadata: { fields: Object.keys(dto) },
  });
  return entry;
}

export async function removeFaqEntry(id: string, auditCtx: AuditContext) {
  await getFaqEntry(id);
  await prisma.faqEntry.delete({ where: { id } });
  await recordAuditEvent(auditCtx, { eventType: 'CONTENT', action: 'DELETED', resourceType: 'FaqEntry', resourceId: id });
}

// Public-facing — no admin gate. Priority descending — same "higher shows
// first" convention as Promotion — then oldest-first so stable-priority
// entries don't reshuffle on every request.
export async function activeFaqEntries() {
  return prisma.faqEntry.findMany({ where: { active: true }, orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }] });
}
