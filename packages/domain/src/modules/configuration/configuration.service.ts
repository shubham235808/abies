import type { z } from 'zod';
import { prisma } from '../../lib/db';
import { ConflictError, NotFoundError } from '../../lib/errors';
import { recordAuditEvent, type AuditContext } from '../../server/audit';
import type {
  configCategorySchema,
  updateConfigCategorySchema,
  serviceLocationSchema,
  updateServiceLocationSchema,
  documentRequirementSchema,
  updateDocumentRequirementSchema,
  courierProviderSchema,
  updateCourierProviderSchema,
  gstRateConfigSchema,
  updateGstRateConfigSchema,
} from './configuration.schemas';
import { getEmailTemplate } from '../notifications/email-templates';
import {
  TEMPLATE_CATALOGUE,
  type RoutingPolicy,
  type TemplateCategory,
  type TemplateChannel,
  type TemplatePriority,
} from '../notifications/templates';

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

// ---- Notification templates (ENTERPRISE-15 — read-only) ----
//
// There used to be an admin-editable NotificationTemplate table here, with
// create/update/remove functions backing a management-web form. That form
// let an admin edit templateKey/channel/subject/body rows that NOTHING at
// send time ever read: every real notify()/notifyMailbox() call resolves
// through the code-registered catalogue in
// ../notifications/templates.ts, which has zero references to
// prisma.notificationTemplate. Editing a row through the old UI changed
// nothing about what actually got sent.
//
// This isn't a wiring gap to close by pointing the UI at the real table,
// either. Two of the three real send paths are structurally not editable
// from this codebase at all:
//   - WhatsApp (lib/notifications/msg91-whatsapp.ts) always sends a
//     provider-approved template: the real body text and variable count
//     live on MSG91/Meta's side as the template named in
//     WHATSAPP_MSG91_TEMPLATE_MAP, not as a body string we own.
//   - Email when EMAIL_PROVIDER=msg91 (the current default in abies-dev
//     and abies-uat) is the same shape: one provider-hosted template,
//     EMAIL_MSG91_TEMPLATE_ID, not a per-notification body.
// The one channel where a body we genuinely author and send exists is SMTP
// email (EMAIL_PROVIDER=smtp/mailer91), rendered by
// ../notifications/email-templates.ts's renderEmailTemplate() — real
// {{variable}} substitution over real HTML/text we control. That one is
// surfaced below with its actual subject/body.
//
// So: no writes, no Postgres NotificationTemplate row is read, and the
// response names the real control point for every row — the actual env
// var — instead of inviting an edit that silently does nothing.

export interface NotificationTemplateCatalogueRow {
  // Synthetic, stable, not a database id — "key:channel" (unique per row).
  id: string;
  templateKey: string;
  channel: TemplateChannel;
  category: TemplateCategory;
  priority: TemplatePriority;
  routingPolicy: RoutingPolicy;
  // CODE: a body we author and that is genuinely sent, shown below.
  // PROVIDER: the real body lives outside this codebase; controlNote names
  // the env var that actually drives it.
  control: 'CODE' | 'PROVIDER';
  controlNote: string;
  subject?: string;
  body?: string;
}

const WHATSAPP_NOTE =
  'Provider-managed. WhatsApp only ever sends a provider-approved template — the real body text and variable ' +
  'layout live on MSG91/Meta\'s side as the template named for this key in WHATSAPP_MSG91_TEMPLATE_MAP, not in ' +
  'this database. Edit the approved template on MSG91/Meta, not from this screen.';

function emailNoteFor(templateKey: string, hasSmtpBody: boolean): string {
  const msg91 =
    'When EMAIL_PROVIDER=msg91 (the current default in abies-dev and abies-uat), this sends through the single ' +
    'provider-hosted template configured by EMAIL_MSG91_TEMPLATE_ID, not the text below.';
  if (hasSmtpBody) {
    return `The subject/body below is real and is what actually sends, but only when EMAIL_PROVIDER=smtp or mailer91. ${msg91}`;
  }
  return (
    `No SMTP-rendered body is registered for "${templateKey}" in notifications/email-templates.ts, so ` +
    `EMAIL_PROVIDER=smtp/mailer91 has nothing to render for it. ${msg91}`
  );
}

// Synchronous and DB-free: this is a static, code-registered catalogue, not
// a query. Call sites that previously awaited the old Postgres-backed
// version still work unchanged (await on a non-promise resolves immediately).
export function listNotificationTemplates(): NotificationTemplateCatalogueRow[] {
  const rows: NotificationTemplateCatalogueRow[] = [];
  for (const def of TEMPLATE_CATALOGUE) {
    for (const channel of Object.keys(def.bodies) as TemplateChannel[]) {
      const base = {
        id: `${def.key}:${channel}`,
        templateKey: def.key,
        channel,
        category: def.category,
        priority: def.priority,
        routingPolicy: def.defaultPolicy,
      };
      if (channel === 'IN_APP') {
        rows.push({
          ...base,
          control: 'CODE',
          controlNote: 'Rendered in-app directly from this catalogue entry. There is no external provider for IN_APP.',
          body: def.bodies.IN_APP?.en,
        });
        continue;
      }
      if (channel === 'WHATSAPP') {
        rows.push({ ...base, control: 'PROVIDER', controlNote: WHATSAPP_NOTE });
        continue;
      }
      // EMAIL
      const emailDef = getEmailTemplate(def.key);
      rows.push({
        ...base,
        control: emailDef ? 'CODE' : 'PROVIDER',
        controlNote: emailNoteFor(def.key, Boolean(emailDef)),
        ...(emailDef ? { subject: emailDef.subject, body: emailDef.paragraphs.join('\n\n') } : {}),
      });
    }
  }
  return rows;
}

// ---- GST rates (ENTERPRISE-7) ----

export async function listGstRates() {
  return prisma.gstRateConfig.findMany({ orderBy: { hsnCode: 'asc' } });
}

export async function createGstRate(dto: z.infer<typeof gstRateConfigSchema>, auditCtx: AuditContext) {
  const existing = await prisma.gstRateConfig.findUnique({ where: { hsnCode: dto.hsnCode } });
  if (existing) throw new ConflictError('A GST rate for this HSN code already exists');
  const row = await prisma.gstRateConfig.create({ data: dto });
  await recordAuditEvent(auditCtx, { eventType: 'CONFIGURATION', action: 'CREATED', resourceType: 'GstRateConfig', resourceId: row.id, metadata: { hsnCode: row.hsnCode, ratePercent: row.ratePercent } });
  return row;
}

export async function updateGstRate(id: string, dto: z.infer<typeof updateGstRateConfigSchema>, auditCtx: AuditContext) {
  const existing = await prisma.gstRateConfig.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('GST rate not found');
  const row = await prisma.gstRateConfig.update({ where: { id }, data: dto });
  await recordAuditEvent(auditCtx, { eventType: 'CONFIGURATION', action: 'UPDATED', resourceType: 'GstRateConfig', resourceId: id, metadata: { fields: Object.keys(dto) } });
  return row;
}

export async function removeGstRate(id: string, auditCtx: AuditContext) {
  const existing = await prisma.gstRateConfig.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('GST rate not found');
  await prisma.gstRateConfig.delete({ where: { id } });
  await recordAuditEvent(auditCtx, { eventType: 'CONFIGURATION', action: 'DELETED', resourceType: 'GstRateConfig', resourceId: id, metadata: { hsnCode: existing.hsnCode } });
}
