import { prisma } from '../../lib/db';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { recordAuditEvent } from '../../server/audit';
import {
  canAssignLeads,
  canWriteLeads,
  CRM_ACCESS_ROLES,
  CRM_OWNER_ROLES,
  canReadAllLeads,
  leadVisibilityWhere,
  requireCrmAccess,
  type CrmActor,
} from './rbac';
import type {
  AddActivityInput,
  CreateLeadInput,
  ListLeadsInput,
  UpdateLeadInput,
} from './leads.schemas';

// Terminal stages: a closed lead doesn't block a new enquiry from the same person.
const CLOSED_STAGES = ['LOST', 'INVALID', 'DUPLICATE'] as const;
const CONTACT_ACTIVITY_TYPES = ['CALL', 'WHATSAPP', 'SMS', 'EMAIL', 'MEETING'];

function auditCtx(actor: CrmActor) {
  return { userId: actor.userId, sessionId: actor.sessionId, ip: actor.ip, userAgent: actor.userAgent };
}

// Reads a lead the actor may see. A lead outside the actor's scope looks the
// same as a missing one, so the response doesn't reveal that it exists.
async function loadVisibleLead(actor: CrmActor, id: string) {
  const lead = await prisma.crmLead.findFirst({ where: { id, ...leadVisibilityWhere(actor) } });
  if (!lead) throw new NotFoundError('Lead not found');
  return lead;
}

function writableLead(actor: CrmActor) {
  if (!canWriteLeads(actor)) throw new ForbiddenError('Your role cannot change CRM leads');
}

async function resolveTags(names: string[] | undefined) {
  if (!names?.length) return [];
  const unique = [...new Set(names.map((n) => n.trim().toLowerCase()).filter(Boolean))];
  const tags = [];
  for (const name of unique) {
    tags.push(await prisma.crmTag.upsert({ where: { name }, create: { name }, update: {} }));
  }
  return tags;
}

async function assertAssignee(assignedToId: string) {
  const user = await prisma.user.findUnique({ where: { id: assignedToId } });
  if (!user || user.status !== 'ACTIVE' || !CRM_OWNER_ROLES.includes(user.role)) {
    throw new BadRequestError('Assign to an active CRM user');
  }
  return user;
}

export async function createLead(dto: CreateLeadInput, actor: CrmActor) {
  requireCrmAccess(actor);
  writableLead(actor);

  // Agents can only take leads for themselves; managers can assign to anyone.
  let assignedToId: string | null = null;
  if (dto.assignedToId) {
    if (!canAssignLeads(actor) && dto.assignedToId !== actor.userId) {
      throw new ForbiddenError('Agents can only assign leads to themselves');
    }
    await assertAssignee(dto.assignedToId);
    assignedToId = dto.assignedToId;
  } else if (!canAssignLeads(actor)) {
    assignedToId = actor.userId;
  }

  // Duplicate check on mobile or email. Never merges; the caller decides.
  const orClauses: { mobile?: string; email?: string }[] = [];
  if (dto.mobile) orClauses.push({ mobile: dto.mobile });
  if (dto.email) orClauses.push({ email: dto.email });
  const existing = await prisma.crmLead.findFirst({
    where: { OR: orClauses, stage: { notIn: [...CLOSED_STAGES] } },
    select: { id: true },
  });
  if (existing) {
    // Users who can't see every lead get the same generic message whether or not
    // the match is theirs, so the response doesn't say which lead it is.
    throw new ConflictError(
      canReadAllLeads(actor)
        ? 'A lead with this mobile or email already exists'
        : 'This contact may already be on file. Ask your manager before adding it.',
    );
  }

  const tags = await resolveTags(dto.tags);
  const lead = await prisma.crmLead.create({
    data: {
      firstName: dto.firstName,
      lastName: dto.lastName,
      mobile: dto.mobile,
      email: dto.email,
      city: dto.city,
      state: dto.state,
      pinCode: dto.pinCode,
      preferredLanguage: dto.preferredLanguage,
      source: dto.source,
      campaign: dto.campaign,
      interestedService: dto.interestedService,
      priority: dto.priority,
      assignedToId,
      createdById: actor.userId,
      tags: { create: tags.map((t) => ({ tagId: t.id })) },
      activities: {
        create: [
          { type: 'CREATED', summary: `Lead created from ${dto.source}`, actorId: actor.userId },
          ...(assignedToId
            ? [{ type: 'ASSIGNMENT', summary: 'Assigned on creation', actorId: actor.userId }]
            : []),
        ],
      },
      ...(assignedToId
        ? {
            assignments: {
              create: { toUserId: assignedToId, actorId: actor.userId, reason: 'Assigned on creation' },
            },
          }
        : {}),
    },
  });

  await recordAuditEvent(auditCtx(actor), {
    eventType: 'CRM_LEAD',
    action: 'CREATED',
    resourceType: 'CrmLead',
    resourceId: lead.id,
    metadata: { source: dto.source, assignedToId, hasMobile: Boolean(dto.mobile), hasEmail: Boolean(dto.email) },
  });
  return lead;
}

export async function listLeads(query: ListLeadsInput, actor: CrmActor) {
  requireCrmAccess(actor);
  const scope = leadVisibilityWhere(actor);
  const filters: Record<string, unknown>[] = [];
  if (query.stage) filters.push({ stage: query.stage });
  if (query.source) filters.push({ source: query.source });
  if (query.assignedToId) filters.push({ assignedToId: query.assignedToId });
  if (query.q) {
    filters.push({
      OR: [
        { firstName: { contains: query.q, mode: 'insensitive' } },
        { lastName: { contains: query.q, mode: 'insensitive' } },
        { mobile: { contains: query.q } },
        { email: { contains: query.q, mode: 'insensitive' } },
      ],
    });
  }
  const where = filters.length ? { AND: [scope, ...filters] } : scope;

  const [leads, total] = await Promise.all([
    prisma.crmLead.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      select: {
        id: true,
        firstName: true,
        lastName: true,
        mobile: true,
        email: true,
        city: true,
        source: true,
        stage: true,
        priority: true,
        assignedToId: true,
        assignedTo: { select: { name: true, mobile: true } },
        nextFollowUpAt: true,
        createdAt: true,
      },
    }),
    prisma.crmLead.count({ where }),
  ]);
  return { leads, total, page: query.page, pageSize: query.pageSize };
}

export async function getLead(id: string, actor: CrmActor) {
  requireCrmAccess(actor);
  const lead = await prisma.crmLead.findFirst({
    where: { id, ...leadVisibilityWhere(actor) },
    include: {
      tags: { include: { tag: true } },
      assignedTo: { select: { id: true, name: true, mobile: true, role: true } },
      activities: { orderBy: { createdAt: 'desc' }, take: 100, include: { actor: { select: { id: true, name: true } } } },
      assignments: { orderBy: { createdAt: 'desc' }, take: 20 },
    },
  });
  if (!lead) throw new NotFoundError('Lead not found');
  return lead;
}

export async function updateLead(id: string, dto: UpdateLeadInput, actor: CrmActor) {
  writableLead(actor);
  const before = await loadVisibleLead(actor, id);
  const data = {
    ...dto,
    nextFollowUpAt: dto.nextFollowUpAt === undefined ? undefined : dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : null,
  };
  const updated = await prisma.crmLead.update({ where: { id }, data });

  const changed = Object.keys(dto) as (keyof UpdateLeadInput)[];
  const diff = Object.fromEntries(
    changed.map((k) => [k, { before: (before as Record<string, unknown>)[k as string] ?? null, after: (updated as Record<string, unknown>)[k as string] ?? null }]),
  );
  await recordAuditEvent(auditCtx(actor), {
    eventType: 'CRM_LEAD',
    action: 'UPDATED',
    resourceType: 'CrmLead',
    resourceId: id,
    metadata: { changes: diff },
  });
  return updated;
}

export async function changeStage(id: string, stage: string, rawReason: string | undefined, actor: CrmActor) {
  writableLead(actor);
  const lead = await loadVisibleLead(actor, id);
  if (lead.stage === stage) return lead;
  const reason = rawReason?.trim() || undefined;
  if (stage === 'LOST' && !reason) throw new BadRequestError('Give a reason for marking the lead lost');

  const updated = await prisma.crmLead.update({
    where: { id },
    data: {
      stage: stage as never,
      convertedAt: stage === 'CONVERTED' ? new Date() : undefined,
      lostReason: stage === 'LOST' ? reason : undefined,
      activities: {
        create: {
          type: 'STAGE_CHANGE',
          summary: `Stage ${lead.stage} → ${stage}${reason ? `: ${reason}` : ''}`,
          actorId: actor.userId,
        },
      },
    },
  });
  await recordAuditEvent(auditCtx(actor), {
    eventType: 'CRM_LEAD',
    action: 'STAGE_CHANGED',
    resourceType: 'CrmLead',
    resourceId: id,
    metadata: { from: lead.stage, to: stage, reason: reason ?? null },
  });
  return updated;
}

export async function assignLead(id: string, assignedToId: string | null, reason: string | undefined, actor: CrmActor) {
  requireCrmAccess(actor);
  if (!canAssignLeads(actor)) throw new ForbiddenError('Your role cannot reassign leads');
  const lead = await loadVisibleLead(actor, id);
  if (assignedToId) await assertAssignee(assignedToId);
  if (lead.assignedToId === assignedToId) return lead;

  const updated = await prisma.crmLead.update({
    where: { id },
    data: {
      assignedToId,
      assignments: {
        create: { fromUserId: lead.assignedToId, toUserId: assignedToId, actorId: actor.userId, reason },
      },
      activities: {
        create: {
          type: 'ASSIGNMENT',
          summary: assignedToId ? 'Assigned to a new owner' : 'Unassigned',
          actorId: actor.userId,
        },
      },
    },
  });
  await recordAuditEvent(auditCtx(actor), {
    eventType: 'CRM_LEAD',
    action: 'ASSIGNED',
    resourceType: 'CrmLead',
    resourceId: id,
    metadata: { from: lead.assignedToId, to: assignedToId, reason: reason ?? null },
  });
  return updated;
}

export async function addActivity(id: string, dto: AddActivityInput, actor: CrmActor) {
  writableLead(actor);
  await loadVisibleLead(actor, id);
  const activity = await prisma.crmActivity.create({
    data: { leadId: id, type: dto.type, summary: dto.summary, actorId: actor.userId },
  });
  if (CONTACT_ACTIVITY_TYPES.includes(dto.type)) {
    await prisma.crmLead.update({ where: { id }, data: { lastContactedAt: new Date() } });
  }
  await recordAuditEvent(auditCtx(actor), {
    eventType: 'CRM_LEAD',
    action: 'ACTIVITY_ADDED',
    resourceType: 'CrmLead',
    resourceId: id,
    metadata: { type: dto.type },
  });
  return activity;
}

// Users a lead can be assigned to: active accounts with a CRM role.
export async function listAssignees(actor: CrmActor) {
  requireCrmAccess(actor);
  if (!canAssignLeads(actor)) throw new ForbiddenError('Your role cannot reassign leads');
  return prisma.user.findMany({
    where: { status: 'ACTIVE', role: { in: CRM_ACCESS_ROLES } },
    select: { id: true, name: true, mobile: true, role: true },
    orderBy: { name: 'asc' },
  });
}
