import type { z } from 'zod';
import { prisma } from '../../lib/db';
import { NotFoundError } from '../../lib/errors';
import { recordAuditEvent, type AuditContext } from '../../server/audit';
import type { createFaqEntrySchema, updateFaqEntrySchema, upsertFaqTranslationSchema } from './faq.schemas';
import { DEFAULT_CONTENT_LANGUAGE, localise, type ContentLanguage, type TranslationLanguage } from './languages';

type CreateFaqEntryInput = z.infer<typeof createFaqEntrySchema>;
type UpdateFaqEntryInput = z.infer<typeof updateFaqEntrySchema>;
type UpsertFaqTranslationInput = z.infer<typeof upsertFaqTranslationSchema>;

const WITH_TRANSLATIONS = { translations: { orderBy: { language: 'asc' } } } as const;

// The admin list is English rows only, each carrying its translations —
// a translation is never managed as a standalone entry.
export async function listFaqEntries() {
  return prisma.faqEntry.findMany({
    where: { translationOfId: null },
    include: WITH_TRANSLATIONS,
    orderBy: [{ active: 'desc' }, { priority: 'desc' }, { createdAt: 'asc' }],
  });
}

export async function getFaqEntry(id: string) {
  const entry = await prisma.faqEntry.findUnique({ where: { id } });
  if (!entry) throw new NotFoundError('FAQ entry not found');
  return entry;
}

// Priority and publish state belong to the English row; a translation row
// is only edited through upsertFaqTranslation.
async function getEnglishFaqEntry(id: string) {
  const entry = await prisma.faqEntry.findFirst({ where: { id, translationOfId: null } });
  if (!entry) throw new NotFoundError('FAQ entry not found');
  return entry;
}

export async function createFaqEntry(dto: CreateFaqEntryInput, auditCtx: AuditContext) {
  const entry = await prisma.faqEntry.create({ data: dto, include: WITH_TRANSLATIONS });
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
  await getEnglishFaqEntry(id);
  const entry = await prisma.faqEntry.update({ where: { id }, data: dto, include: WITH_TRANSLATIONS });
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

export async function upsertFaqTranslation(sourceId: string, dto: UpsertFaqTranslationInput, auditCtx: AuditContext) {
  const source = await getEnglishFaqEntry(sourceId);
  const { language, ...fields } = dto;
  const key = { translationOfId_language: { translationOfId: source.id, language } };
  const existing = await prisma.faqEntry.findUnique({ where: key });
  const translation = await prisma.faqEntry.upsert({
    where: key,
    create: { ...fields, language, translationOfId: source.id, priority: source.priority },
    update: fields,
  });
  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: existing ? 'UPDATED' : 'CREATED',
    resourceType: 'FaqEntry',
    resourceId: translation.id,
    metadata: { translationOf: source.id, language },
  });
  return translation;
}

export async function removeFaqTranslation(sourceId: string, language: TranslationLanguage, auditCtx: AuditContext) {
  const translation = await prisma.faqEntry.findUnique({ where: { translationOfId_language: { translationOfId: sourceId, language } } });
  if (!translation) throw new NotFoundError('Translation not found');
  await prisma.faqEntry.delete({ where: { id: translation.id } });
  await recordAuditEvent(auditCtx, {
    eventType: 'CONTENT',
    action: 'DELETED',
    resourceType: 'FaqEntry',
    resourceId: translation.id,
    metadata: { translationOf: sourceId, language },
  });
}

export interface ServedFaqEntry {
  id: string;
  language: string;
  question: string;
  answer: string;
}

// Public-facing — no admin gate. Priority descending — same "higher shows
// first" convention as Promotion — then oldest-first so stable-priority
// entries don't reshuffle on every request. Each entry is served in the
// requested language when translated, otherwise in English.
export async function activeFaqEntries(language: ContentLanguage = DEFAULT_CONTENT_LANGUAGE): Promise<ServedFaqEntry[]> {
  const rows = await prisma.faqEntry.findMany({
    where: { active: true, translationOfId: null },
    include: { translations: { where: { language } } },
    orderBy: [{ priority: 'desc' }, { createdAt: 'asc' }],
  });
  return rows.map((row) => {
    const served = localise(row, row.translations, language);
    return { id: row.id, language: served.language, question: served.question, answer: served.answer };
  });
}
