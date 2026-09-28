import type { z } from 'zod';
import { prisma } from '@/lib/db';
import { ConflictError, NotFoundError } from '@/lib/errors';
import { recordAuditEvent, type AuditContext } from '@/server/audit';
import type {
  configCategorySchema,
  updateConfigCategorySchema,
  serviceLocationSchema,
  updateServiceLocationSchema,
  documentRequirementSchema,
  updateDocumentRequirementSchema,
  courierProviderSchema,
  updateCourierProviderSchema,
  notificationTemplateSchema,
  updateNotificationTemplateSchema,
} from './configuration.schemas';

// ENTERPRISE-2 — generalizes AssessmentTemplateField's existing "admin-
// editable lookup table, no migration to add an entry" shape (Phase 5)
// across the five config domains docs/ENTERPRISE-DATA-MODEL-CHANGES.md §1
// named. Every mutation is audited — these are exactly the "sensitive
// configuration changes" docs/SECURITY-MODEL.md already named as an
// MFA-gated privileged action; the MFA gate itself lives in the route
// handlers (requireAdminMfa), matching every other admin-privileged module.

// ---- Config categories (specialties, medicine/diagnostic/panchakarma/
// support categories, consultation modes, ...) ----

export async function listConfigCategories(domain?: string) {
  return prisma.configCategory.findMany({
    where: domain ? { domain } : undefined,
    orderBy: [{ domain: 'asc' }, { sortOrder: 'asc' }, { label: 'asc' }],
  });
}

export async function listConfigDomains() {
  const rows = await prisma.configCategory.findMany({ distinct: ['domain'], select: { domain: true }, orderBy: { domain: 'asc' } });
  return rows.map((r) => r.domain);
}

export async function createConfigCategory(dto: z.infer<typeof configCategorySchema>, auditCtx: AuditContext) {
  const existing = await prisma.configCategory.findUnique({ where: { domain_key: { domain: dto.domain, key: dto.key } } });
  if (existing) throw new ConflictError('An entry with this key already exists in this domain');
  const row = await prisma.configCategory.create({ data: dto });
  await recordAuditEvent(auditCtx, { eventType: 'CONFIGURATION', action: 'CREATED', resourceType: 'ConfigCategory', resourceId: row.id, metadata: { domain: row.domain, key: row.key } });
  return row;
}

export async function updateConfigCategory(id: string, dto: z.infer<typeof updateConfigCategorySchema>, auditCtx: AuditContext) {
  const existing = await prisma.configCategory.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Config entry not found');
  const row = await prisma.configCategory.update({ where: { id }, data: dto });
  await recordAuditEvent(auditCtx, { eventType: 'CONFIGURATION', action: 'UPDATED', resourceType: 'ConfigCategory', resourceId: id, metadata: { fields: Object.keys(dto) } });
  return row;
}

export async function removeConfigCategory(id: string, auditCtx: AuditContext) {
  const existing = await prisma.configCategory.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Config entry not found');
  await prisma.configCategory.delete({ where: { id } });
  await recordAuditEvent(auditCtx, { eventType: 'CONFIGURATION', action: 'DELETED', resourceType: 'ConfigCategory', resourceId: id, metadata: { domain: existing.domain, key: existing.key } });
}

// ---- Service locations ----

export async function listServiceLocations() {
  return prisma.serviceLocation.findMany({ orderBy: [{ state: 'asc' }, { city: 'asc' }] });
}

export async function createServiceLocation(dto: z.infer<typeof serviceLocationSchema>, auditCtx: AuditContext) {
  const existing = await prisma.serviceLocation.findUnique({ where: { city_state: { city: dto.city, state: dto.state } } });
  if (existing) throw new ConflictError('This city/state is already configured');
  const row = await prisma.serviceLocation.create({ data: dto });
  await recordAuditEvent(auditCtx, { eventType: 'CONFIGURATION', action: 'CREATED', resourceType: 'ServiceLocation', resourceId: row.id, metadata: { city: row.city, state: row.state } });
  return row;
}

export async function updateServiceLocation(id: string, dto: z.infer<typeof updateServiceLocationSchema>, auditCtx: AuditContext) {
  const existing = await prisma.serviceLocation.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Location not found');
  const row = await prisma.serviceLocation.update({ where: { id }, data: dto });
  await recordAuditEvent(auditCtx, { eventType: 'CONFIGURATION', action: 'UPDATED', resourceType: 'ServiceLocation', resourceId: id, metadata: { fields: Object.keys(dto) } });
  return row;
}

export async function removeServiceLocation(id: string, auditCtx: AuditContext) {
  const existing = await prisma.serviceLocation.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Location not found');
  await prisma.serviceLocation.delete({ where: { id } });
  await recordAuditEvent(auditCtx, { eventType: 'CONFIGURATION', action: 'DELETED', resourceType: 'ServiceLocation', resourceId: id, metadata: { city: existing.city, state: existing.state } });
}

// ---- Document requirements ----

export async function listDocumentRequirements(partnerType?: string) {
  return prisma.documentRequirement.findMany({
    where: partnerType ? { partnerType } : undefined,
    orderBy: [{ partnerType: 'asc' }, { documentType: 'asc' }],
  });
}

export async function createDocumentRequirement(dto: z.infer<typeof documentRequirementSchema>, auditCtx: AuditContext) {
  const existing = await prisma.documentRequirement.findUnique({
    where: { partnerType_documentType: { partnerType: dto.partnerType, documentType: dto.documentType } },
  });
  if (existing) throw new ConflictError('This document type is already configured for this partner type');
  const row = await prisma.documentRequirement.create({ data: dto });
  await recordAuditEvent(auditCtx, { eventType: 'CONFIGURATION', action: 'CREATED', resourceType: 'DocumentRequirement', resourceId: row.id, metadata: { partnerType: row.partnerType, documentType: row.documentType } });
  return row;
}

export async function updateDocumentRequirement(id: string, dto: z.infer<typeof updateDocumentRequirementSchema>, auditCtx: AuditContext) {
  const existing = await prisma.documentRequirement.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Document requirement not found');
  const row = await prisma.documentRequirement.update({ where: { id }, data: dto });
  await recordAuditEvent(auditCtx, { eventType: 'CONFIGURATION', action: 'UPDATED', resourceType: 'DocumentRequirement', resourceId: id, metadata: { fields: Object.keys(dto) } });
  return row;
}

export async function removeDocumentRequirement(id: string, auditCtx: AuditContext) {
  const existing = await prisma.documentRequirement.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Document requirement not found');
  await prisma.documentRequirement.delete({ where: { id } });
  await recordAuditEvent(auditCtx, { eventType: 'CONFIGURATION', action: 'DELETED', resourceType: 'DocumentRequirement', resourceId: id, metadata: { partnerType: existing.partnerType, documentType: existing.documentType } });
}

// ---- Courier providers ----

export async function listCourierProviders() {
  return prisma.courierProvider.findMany({ orderBy: { label: 'asc' } });
}

export async function createCourierProvider(dto: z.infer<typeof courierProviderSchema>, auditCtx: AuditContext) {
  const existing = await prisma.courierProvider.findUnique({ where: { code: dto.code } });
  if (existing) throw new ConflictError('A courier provider with this code already exists');
  const row = await prisma.courierProvider.create({ data: dto });
  await recordAuditEvent(auditCtx, { eventType: 'CONFIGURATION', action: 'CREATED', resourceType: 'CourierProvider', resourceId: row.id, metadata: { code: row.code } });
  return row;
}

export async function updateCourierProvider(id: string, dto: z.infer<typeof updateCourierProviderSchema>, auditCtx: AuditContext) {
  const existing = await prisma.courierProvider.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Courier provider not found');
  const row = await prisma.courierProvider.update({ where: { id }, data: dto });
  await recordAuditEvent(auditCtx, { eventType: 'CONFIGURATION', action: 'UPDATED', resourceType: 'CourierProvider', resourceId: id, metadata: { fields: Object.keys(dto) } });
  return row;
}

export async function removeCourierProvider(id: string, auditCtx: AuditContext) {
  const existing = await prisma.courierProvider.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Courier provider not found');
  await prisma.courierProvider.delete({ where: { id } });
  await recordAuditEvent(auditCtx, { eventType: 'CONFIGURATION', action: 'DELETED', resourceType: 'CourierProvider', resourceId: id, metadata: { code: existing.code } });
}

// ---- Notification templates ----

export async function listNotificationTemplates() {
  return prisma.notificationTemplate.findMany({ orderBy: { templateKey: 'asc' } });
}

export async function createNotificationTemplate(dto: z.infer<typeof notificationTemplateSchema>, auditCtx: AuditContext) {
  const existing = await prisma.notificationTemplate.findUnique({ where: { templateKey: dto.templateKey } });
  if (existing) throw new ConflictError('A template with this key already exists');
  const row = await prisma.notificationTemplate.create({ data: dto });
  await recordAuditEvent(auditCtx, { eventType: 'CONFIGURATION', action: 'CREATED', resourceType: 'NotificationTemplate', resourceId: row.id, metadata: { templateKey: row.templateKey } });
  return row;
}

export async function updateNotificationTemplate(id: string, dto: z.infer<typeof updateNotificationTemplateSchema>, auditCtx: AuditContext) {
  const existing = await prisma.notificationTemplate.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Notification template not found');
  const row = await prisma.notificationTemplate.update({ where: { id }, data: dto });
  await recordAuditEvent(auditCtx, { eventType: 'CONFIGURATION', action: 'UPDATED', resourceType: 'NotificationTemplate', resourceId: id, metadata: { fields: Object.keys(dto) } });
  return row;
}

export async function removeNotificationTemplate(id: string, auditCtx: AuditContext) {
  const existing = await prisma.notificationTemplate.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Notification template not found');
  await prisma.notificationTemplate.delete({ where: { id } });
  await recordAuditEvent(auditCtx, { eventType: 'CONFIGURATION', action: 'DELETED', resourceType: 'NotificationTemplate', resourceId: id, metadata: { templateKey: existing.templateKey } });
}
