import type { CrmTaskStatus } from '@prisma/client';
import { prisma } from '../../lib/db';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { recordAuditEvent } from '../../server/audit';
import {
  canAssignLeads,
  canWriteLeads,
  CRM_OWNER_ROLES,
  leadVisibilityWhere,
  opportunityVisibilityWhere,
  requireCrmAccess,
  taskVisibilityWhere,
  type CrmActor,
} from './rbac';
import type {
  CreateOpportunityInput,
  CreateTaskInput,
  ListOpportunitiesInput,
  ListTasksInput,
  UpdateOpportunityInput,
  UpdateTaskInput,
} from './sales.schemas';

function auditCtx(actor: CrmActor) {
  return { userId: actor.userId, sessionId: actor.sessionId, ip: actor.ip, userAgent: actor.userAgent };
}

function writable(actor: CrmActor) {
  if (!canWriteLeads(actor)) throw new ForbiddenError('Your role cannot change CRM records');
}

// A lead or opportunity the actor can't see is "not found", so the response
// never reveals that it exists.
async function visibleLead(actor: CrmActor, leadId: string) {
  const lead = await prisma.crmLead.findFirst({ where: { id: leadId, ...leadVisibilityWhere(actor) } });
  if (!lead) throw new NotFoundError('Lead not found');
  return lead;
}

async function visibleOpportunity(actor: CrmActor, id: string) {
  const opp = await prisma.crmOpportunity.findFirst({ where: { id, ...opportunityVisibilityWhere(actor) } });
  if (!opp) throw new NotFoundError('Opportunity not found');
  return opp;
}

async function visibleTask(actor: CrmActor, id: string) {
  const task = await prisma.crmTask.findFirst({ where: { id, ...taskVisibilityWhere(actor) } });
  if (!task) throw new NotFoundError('Task not found');
  return task;
}

// Owners and assignees must be active users with a CRM role that can own work.
async function assertOwner(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user || user.status !== 'ACTIVE' || !CRM_OWNER_ROLES.includes(user.role)) {
    throw new BadRequestError('Assign to an active sales or CRM user');
  }
}

// ---------------------------------------------------------------- opportunities

export async function createOpportunity(dto: CreateOpportunityInput, actor: CrmActor) {
  requireCrmAccess(actor);
  writable(actor);
  if (dto.leadId) await visibleLead(actor, dto.leadId);

  let ownerId = actor.userId;
  if (dto.ownerId && dto.ownerId !== actor.userId) {
    if (!canAssignLeads(actor)) throw new ForbiddenError('Agents can only own opportunities themselves');
    await assertOwner(dto.ownerId);
    ownerId = dto.ownerId;
  }

  const opp = await prisma.crmOpportunity.create({
    data: {
      leadId: dto.leadId,
      title: dto.title,
      service: dto.service,
      expectedValue: dto.expectedValue,
      probability: dto.probability,
      expectedCloseAt: dto.expectedCloseAt ? new Date(dto.expectedCloseAt) : null,
      ownerId,
      createdById: actor.userId,
    },
  });
  await recordAuditEvent(auditCtx(actor), {
    eventType: 'CRM_OPPORTUNITY',
    action: 'CREATED',
    resourceType: 'CrmOpportunity',
    resourceId: opp.id,
    metadata: { leadId: dto.leadId ?? null, expectedValue: dto.expectedValue, probability: dto.probability },
  });
  return opp;
}

export async function listOpportunities(query: ListOpportunitiesInput, actor: CrmActor) {
  requireCrmAccess(actor);
  const scope = opportunityVisibilityWhere(actor);
  const filters: Record<string, unknown>[] = [];
  if (query.status) filters.push({ status: query.status });
  if (query.ownerId) filters.push({ ownerId: query.ownerId });
  const where = filters.length ? { AND: [scope, ...filters] } : scope;
  const [items, total] = await Promise.all([
    prisma.crmOpportunity.findMany({
      where,
      orderBy: [{ status: 'asc' }, { expectedCloseAt: 'asc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        lead: { select: { id: true, firstName: true, lastName: true } },
        owner: { select: { id: true, name: true, mobile: true } },
      },
    }),
    prisma.crmOpportunity.count({ where }),
  ]);
  return { opportunities: items, total, page: query.page, pageSize: query.pageSize };
}

export async function getOpportunity(id: string, actor: CrmActor) {
  requireCrmAccess(actor);
  const opp = await prisma.crmOpportunity.findFirst({
    where: { id, ...opportunityVisibilityWhere(actor) },
    include: {
      lead: { select: { id: true, firstName: true, lastName: true, stage: true } },
      owner: { select: { id: true, name: true, mobile: true } },
      tasks: { orderBy: { dueAt: 'asc' }, take: 50 },
    },
  });
  if (!opp) throw new NotFoundError('Opportunity not found');
  return opp;
}

export async function updateOpportunity(id: string, dto: UpdateOpportunityInput, actor: CrmActor) {
  writable(actor);
  const before = await visibleOpportunity(actor, id);
  if (before.status !== 'OPEN') throw new BadRequestError('Closed opportunities cannot be edited');
  if (dto.ownerId !== undefined && dto.ownerId !== null && dto.ownerId !== before.ownerId) {
    if (!canAssignLeads(actor)) throw new ForbiddenError('Your role cannot reassign opportunities');
    await assertOwner(dto.ownerId);
  }
  if (dto.ownerId !== undefined && !canAssignLeads(actor) && dto.ownerId !== actor.userId) {
    throw new ForbiddenError('Your role cannot reassign opportunities');
  }
  const updated = await prisma.crmOpportunity.update({
    where: { id },
    data: {
      title: dto.title,
      service: dto.service,
      expectedValue: dto.expectedValue,
      probability: dto.probability,
      expectedCloseAt: dto.expectedCloseAt === undefined ? undefined : dto.expectedCloseAt ? new Date(dto.expectedCloseAt) : null,
      ownerId: dto.ownerId === undefined ? undefined : dto.ownerId,
    },
  });
  await recordAuditEvent(auditCtx(actor), {
    eventType: 'CRM_OPPORTUNITY',
    action: 'UPDATED',
    resourceType: 'CrmOpportunity',
    resourceId: id,
    metadata: { changedKeys: Object.keys(dto) },
  });
  return updated;
}

// Closing is idempotent: closing a WON opportunity as WON again changes nothing.
export async function closeOpportunity(id: string, outcome: 'WON' | 'LOST', reason: string | undefined, actor: CrmActor) {
  writable(actor);
  const opp = await visibleOpportunity(actor, id);
  if (opp.status === outcome) return opp;
  if (opp.status !== 'OPEN') throw new BadRequestError('This opportunity is already closed');

  const updated = await prisma.$transaction(async (tx) => {
    const closed = await tx.crmOpportunity.update({
      where: { id },
      data:
        outcome === 'WON'
          ? { status: 'WON', wonAt: new Date() }
          : { status: 'LOST', lostReason: reason ?? null },
    });
    // A won deal converts its lead, once.
    if (outcome === 'WON' && opp.leadId) {
      const lead = await tx.crmLead.findUnique({ where: { id: opp.leadId } });
      if (lead && lead.stage !== 'CONVERTED') {
        await tx.crmLead.update({
          where: { id: opp.leadId },
          data: {
            stage: 'CONVERTED',
            convertedAt: new Date(),
            activities: {
              create: { type: 'STAGE_CHANGE', summary: `Converted: opportunity "${opp.title}" won`, actorId: actor.userId },
            },
          },
        });
      }
    }
    return closed;
  });

  await recordAuditEvent(auditCtx(actor), {
    eventType: 'CRM_OPPORTUNITY',
    action: outcome === 'WON' ? 'WON' : 'LOST',
    resourceType: 'CrmOpportunity',
    resourceId: id,
    metadata: { from: opp.status, to: outcome, value: opp.expectedValue, leadId: opp.leadId },
  });
  return updated;
}

// ------------------------------------------------------------------------ tasks

export async function createTask(dto: CreateTaskInput, actor: CrmActor) {
  requireCrmAccess(actor);
  writable(actor);
  if (dto.leadId) await visibleLead(actor, dto.leadId);
  if (dto.opportunityId) await visibleOpportunity(actor, dto.opportunityId);

  let assignedToId = actor.userId;
  if (dto.assignedToId && dto.assignedToId !== actor.userId) {
    if (!canAssignLeads(actor)) throw new ForbiddenError('Agents can only create tasks for themselves');
    await assertOwner(dto.assignedToId);
    assignedToId = dto.assignedToId;
  }

  const task = await prisma.crmTask.create({
    data: {
      title: dto.title,
      description: dto.description,
      type: dto.type,
      priority: dto.priority,
      dueAt: dto.dueAt ? new Date(dto.dueAt) : null,
      leadId: dto.leadId,
      opportunityId: dto.opportunityId,
      assignedToId,
      createdById: actor.userId,
    },
  });
  await recordAuditEvent(auditCtx(actor), {
    eventType: 'CRM_TASK',
    action: 'CREATED',
    resourceType: 'CrmTask',
    resourceId: task.id,
    metadata: { type: dto.type, leadId: dto.leadId ?? null, opportunityId: dto.opportunityId ?? null },
  });
  return task;
}

// Day boundaries in India time (UTC+05:30), since sales works in IST.
function istDay(now: Date): { start: Date; end: Date } {
  const IST_OFFSET_MS = 5.5 * 60 * 60 * 1000;
  const local = new Date(now.getTime() + IST_OFFSET_MS);
  const startLocal = Date.UTC(local.getUTCFullYear(), local.getUTCMonth(), local.getUTCDate());
  const start = new Date(startLocal - IST_OFFSET_MS);
  return { start, end: new Date(start.getTime() + 24 * 60 * 60 * 1000) };
}

function viewFilter(view: ListTasksInput['view'], now: Date): Record<string, unknown> | null {
  const { start, end } = istDay(now);
  switch (view) {
    case 'today':
      return { status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED'] }, dueAt: { gte: start, lt: end } };
    case 'overdue':
      return { status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED'] }, dueAt: { lt: start } };
    case 'upcoming':
      return { status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED'] }, dueAt: { gte: end } };
    case 'completed':
      return { status: 'COMPLETED' };
    default:
      return null;
  }
}

export async function listTasks(query: ListTasksInput, actor: CrmActor, now = new Date()) {
  requireCrmAccess(actor);
  const filters: Record<string, unknown>[] = [taskVisibilityWhere(actor)];
  const view = viewFilter(query.view, now);
  if (view) filters.push(view);
  if (query.assignedToId) filters.push({ assignedToId: query.assignedToId });
  const where = { AND: filters };
  const [items, total] = await Promise.all([
    prisma.crmTask.findMany({
      where,
      orderBy: [{ dueAt: 'asc' }, { createdAt: 'desc' }],
      skip: (query.page - 1) * query.pageSize,
      take: query.pageSize,
      include: {
        lead: { select: { id: true, firstName: true, lastName: true } },
        assignedTo: { select: { id: true, name: true } },
      },
    }),
    prisma.crmTask.count({ where }),
  ]);
  return { tasks: items, total, page: query.page, pageSize: query.pageSize };
}

export async function updateTask(id: string, dto: UpdateTaskInput, actor: CrmActor, now = new Date()) {
  writable(actor);
  const before = await visibleTask(actor, id);
  if (before.status === 'CANCELLED') throw new BadRequestError('Cancelled tasks cannot be changed');
  if (dto.assignedToId !== undefined && dto.assignedToId !== null && dto.assignedToId !== before.assignedToId) {
    if (!canAssignLeads(actor)) throw new ForbiddenError('Your role cannot reassign tasks');
    await assertOwner(dto.assignedToId);
  }
  // Completing is idempotent and keeps the first completion time.
  const completing = dto.status === 'COMPLETED' && before.status !== 'COMPLETED';
  const updated = await prisma.crmTask.update({
    where: { id },
    data: {
      title: dto.title,
      description: dto.description,
      dueAt: dto.dueAt === undefined ? undefined : dto.dueAt ? new Date(dto.dueAt) : null,
      outcome: dto.outcome,
      assignedToId: dto.assignedToId === undefined ? undefined : dto.assignedToId,
      status: dto.status,
      completedAt: completing ? now : dto.status && dto.status !== 'COMPLETED' ? null : undefined,
    },
  });
  if (completing && before.leadId) {
    await prisma.crmActivity.create({
      data: { leadId: before.leadId, type: 'NOTE', summary: `Task done: ${before.title}${dto.outcome ? ` — ${dto.outcome}` : ''}`, actorId: actor.userId },
    });
  }
  await recordAuditEvent(auditCtx(actor), {
    eventType: 'CRM_TASK',
    action: completing ? 'COMPLETED' : 'UPDATED',
    resourceType: 'CrmTask',
    resourceId: id,
    metadata: { from: before.status, to: updated.status },
  });
  return updated;
}

// ------------------------------------------------------------------- dashboard

export async function dashboard(actor: CrmActor, now = new Date()) {
  requireCrmAccess(actor);
  const leadScope = leadVisibilityWhere(actor);
  const oppScope = opportunityVisibilityWhere(actor);
  const taskScope = taskVisibilityWhere(actor);
  const { start, end } = istDay(now);
  const openTasks = { status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED'] as CrmTaskStatus[] } };

  const [stageCounts, openOpps, wonOpps, overdue, dueToday] = await Promise.all([
    prisma.crmLead.groupBy({ by: ['stage'], where: leadScope, _count: { _all: true } }),
    prisma.crmOpportunity.findMany({ where: { AND: [oppScope, { status: 'OPEN' }] }, select: { expectedValue: true, probability: true } }),
    prisma.crmOpportunity.aggregate({ where: { AND: [oppScope, { status: 'WON' }] }, _sum: { expectedValue: true }, _count: { _all: true } }),
    prisma.crmTask.count({ where: { AND: [taskScope, openTasks, { dueAt: { lt: start } }] } }),
    prisma.crmTask.count({ where: { AND: [taskScope, openTasks, { dueAt: { gte: start, lt: end } }] } }),
  ]);

  const leadsByStage = Object.fromEntries(stageCounts.map((r) => [r.stage, r._count._all]));
  // Sum first, round once: rounding each deal would inflate the total.
  const pipelineValue = Math.round(openOpps.reduce((sum, o) => sum + (o.expectedValue * o.probability) / 100, 0));
  return {
    leadsByStage,
    leadsTotal: stageCounts.reduce((sum, r) => sum + r._count._all, 0),
    pipeline: { openCount: openOpps.length, weightedValue: pipelineValue },
    won: { count: wonOpps._count._all, value: wonOpps._sum.expectedValue ?? 0 },
    tasks: { overdue, dueToday },
  };
}
