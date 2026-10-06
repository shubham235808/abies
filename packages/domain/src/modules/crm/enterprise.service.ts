import { prisma } from '../../lib/db';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { recordAuditEvent } from '../../server/audit';
import { requireCrmAccess, type CrmActor } from './rbac';

// Phase 7 controls (docs/CRM-IMPLEMENTATION-PLAN.md). Defaults, pending review:
// export is for CRM admins and auditors only, capped and audited; merges are for
// admins and CRM admins only, explicit, transactional and audited.

const EXPORT_ROLES = ['ADMIN', 'CRM_ADMIN', 'AUDITOR'] as const;
const MERGE_ROLES = ['ADMIN', 'CRM_ADMIN'] as const;
const AUDIT_ROLES = ['ADMIN', 'CRM_ADMIN', 'AUDITOR'] as const;
const EXPORT_CAP = 5000;
const CLOSED = ['CONVERTED', 'LOST', 'INVALID', 'DUPLICATE', 'DO_NOT_CONTACT'] as const;
const CRM_EVENT_TYPES = ['CRM_LEAD', 'CRM_OPPORTUNITY', 'CRM_TASK', 'CRM_AUTOMATION', 'CRM_EXPORT'] as const;

function auditCtx(actor: CrmActor) {
  return { userId: actor.userId, sessionId: actor.sessionId, ip: actor.ip, userAgent: actor.userAgent };
}

function requireRole(actor: CrmActor, roles: readonly string[], message: string) {
  requireCrmAccess(actor);
  if (!roles.includes(actor.role)) throw new ForbiddenError(message);
}

// Auditors see a masked mobile. CRM admins and admins see it in full, as they
// need it to work the list.
function maskMobile(mobile: string | null, role: string): string | null {
  if (!mobile || role !== 'AUDITOR') return mobile;
  return `${'*'.repeat(Math.max(0, mobile.length - 4))}${mobile.slice(-4)}`;
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? '' : String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// ------------------------------------------------------------------- export

export async function exportLeadsCsv(actor: CrmActor, filter: { stage?: string; source?: string } = {}) {
  requireRole(actor, EXPORT_ROLES, 'Only CRM administrators and auditors can export leads');
  const where = {
    ...(filter.stage ? { stage: filter.stage as never } : {}),
    ...(filter.source ? { source: filter.source } : {}),
  };
  const leads = await prisma.crmLead.findMany({
    where,
    orderBy: { createdAt: 'desc' },
    take: EXPORT_CAP,
    select: {
      id: true, firstName: true, lastName: true, mobile: true, email: true, city: true, state: true,
      source: true, campaign: true, stage: true, priority: true, createdAt: true, lastContactedAt: true,
      assignedTo: { select: { name: true } },
    },
  });
  const header = ['id', 'first_name', 'last_name', 'mobile', 'email', 'city', 'state', 'source', 'campaign', 'stage', 'priority', 'owner', 'created_at', 'last_contacted_at'];
  const rows = leads.map((l) =>
    [l.id, l.firstName, l.lastName, maskMobile(l.mobile, actor.role), l.email && actor.role === 'AUDITOR' ? '' : l.email, l.city, l.state, l.source, l.campaign, l.stage, l.priority, l.assignedTo?.name, l.createdAt.toISOString(), l.lastContactedAt?.toISOString()]
      .map(csvCell)
      .join(','),
  );
  // Every export is recorded: who, when, what filter, how many rows.
  await recordAuditEvent(auditCtx(actor), {
    eventType: 'CRM_EXPORT',
    action: 'LEADS_EXPORTED',
    resourceType: 'CrmLead',
    metadata: { rows: leads.length, cap: EXPORT_CAP, filter, capped: leads.length === EXPORT_CAP },
  });
  return { filename: `crm-leads-${new Date().toISOString().slice(0, 10)}.csv`, csv: [header.join(','), ...rows].join('\n'), rows: leads.length };
}

// ------------------------------------------------------------ duplicates

// Open leads that share a mobile number or an email. Nothing is merged here.
export async function listDuplicateGroups(actor: CrmActor) {
  requireRole(actor, MERGE_ROLES, 'Only CRM administrators can review duplicates');
  const open = await prisma.crmLead.findMany({
    where: { stage: { notIn: [...CLOSED] } },
    select: { id: true, firstName: true, lastName: true, mobile: true, email: true, stage: true, createdAt: true },
    take: 5000,
  });
  const groups = new Map<string, typeof open>();
  for (const lead of open) {
    for (const key of [lead.mobile ? `m:${lead.mobile}` : null, lead.email ? `e:${lead.email}` : null].filter(Boolean) as string[]) {
      groups.set(key, [...(groups.get(key) ?? []), lead]);
    }
  }
  // A lead can appear under both its mobile and its email; report each group once.
  const seen = new Set<string>();
  const result: { matchedOn: string; leads: typeof open }[] = [];
  for (const [key, leads] of groups) {
    if (leads.length < 2) continue;
    const signature = leads.map((l) => l.id).sort().join('|');
    if (seen.has(signature)) continue;
    seen.add(signature);
    result.push({ matchedOn: key.startsWith('m:') ? 'mobile' : 'email', leads });
  }
  return result;
}

// ------------------------------------------------------------------ merge

// Moves a duplicate's activities, tasks, opportunities and tags onto the target,
// then marks the source DUPLICATE. Everything happens in one transaction.
export async function mergeLeads(targetId: string, sourceId: string, reason: string, actor: CrmActor) {
  requireRole(actor, MERGE_ROLES, 'Only CRM administrators can merge leads');
  if (targetId === sourceId) throw new BadRequestError('Choose two different leads');
  const [target, source] = await Promise.all([
    prisma.crmLead.findUnique({ where: { id: targetId }, include: { tags: true } }),
    prisma.crmLead.findUnique({ where: { id: sourceId }, include: { tags: true } }),
  ]);
  if (!target || !source) throw new NotFoundError('Lead not found');
  if (source.stage === 'DUPLICATE') throw new BadRequestError('This lead is already marked as a duplicate');
  if (target.stage === 'DUPLICATE') throw new BadRequestError('Merge into the lead that is kept, not a duplicate');

  await prisma.$transaction(async (tx) => {
    await tx.crmActivity.updateMany({ where: { leadId: sourceId }, data: { leadId: targetId } });
    await tx.crmTask.updateMany({ where: { leadId: sourceId }, data: { leadId: targetId } });
    await tx.crmOpportunity.updateMany({ where: { leadId: sourceId }, data: { leadId: targetId } });
    const targetTagIds = new Set(target.tags.map((t) => t.tagId));
    for (const t of source.tags) {
      if (!targetTagIds.has(t.tagId)) await tx.crmLeadTag.create({ data: { leadId: targetId, tagId: t.tagId } });
    }
    await tx.crmLeadTag.deleteMany({ where: { leadId: sourceId } });
    await tx.crmLead.update({
      where: { id: sourceId },
      data: {
        stage: 'DUPLICATE',
        activities: { create: { type: 'NOTE', summary: `Merged into lead ${targetId}: ${reason}`, actorId: actor.userId } },
      },
    });
    await tx.crmLead.update({
      where: { id: targetId },
      data: {
        activities: { create: { type: 'NOTE', summary: `Duplicate lead ${sourceId} merged in: ${reason}`, actorId: actor.userId } },
      },
    });
  });

  await recordAuditEvent(auditCtx(actor), {
    eventType: 'CRM_LEAD',
    action: 'MERGED',
    resourceType: 'CrmLead',
    resourceId: targetId,
    metadata: { sourceId, targetId, reason, movedTasks: true },
  });
  return { targetId, sourceId };
}

// ------------------------------------------------------------- audit view

export async function listCrmAudit(actor: CrmActor, limit = 100) {
  requireRole(actor, AUDIT_ROLES, 'Only auditors and CRM administrators can read the CRM audit log');
  return prisma.auditEvent.findMany({
    where: { eventType: { in: [...CRM_EVENT_TYPES] } },
    orderBy: { createdAt: 'desc' },
    take: Math.min(limit, 200),
    select: { id: true, eventType: true, action: true, resourceType: true, resourceId: true, userId: true, metadata: true, createdAt: true },
  });
}
