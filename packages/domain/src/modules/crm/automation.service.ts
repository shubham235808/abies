import { prisma } from '../../lib/db';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { recordAuditEvent } from '../../server/audit';
import { notify } from '../notifications/notifications.service';
import { isIdle, ruleMatches, type Condition } from './automation.evaluator';
import type { CreateRuleInput } from './automation.schemas';
import { requireCrmAccess, type CrmActor } from './rbac';

// Only admins and CRM admins manage automation; rules change who gets work.
const MANAGE_ROLES = ['ADMIN', 'CRM_ADMIN'] as const;
const CLOSED_STAGES = ['CONVERTED', 'LOST', 'INVALID', 'DUPLICATE', 'DO_NOT_CONTACT'] as const;

function auditCtx(actor: CrmActor) {
  return { userId: actor.userId, sessionId: actor.sessionId, ip: actor.ip, userAgent: actor.userAgent };
}

function requireManage(actor: CrmActor) {
  requireCrmAccess(actor);
  if (!(MANAGE_ROLES as readonly string[]).includes(actor.role)) {
    throw new ForbiddenError('Only CRM administrators can manage automation');
  }
}

export async function createRule(dto: CreateRuleInput, actor: CrmActor) {
  requireManage(actor);
  const action = dto.actionConfig;
  if (action.type === 'ASSIGN_TO_USER') {
    const target = await prisma.user.findUnique({ where: { id: action.userId } });
    if (!target || target.status !== 'ACTIVE') throw new BadRequestError('Assign to an active user');
  }
  const rule = await prisma.crmAutomationRule.create({
    data: {
      name: dto.name,
      trigger: dto.trigger,
      conditions: dto.conditions,
      action: action.type,
      actionConfig: action,
      createdById: actor.userId,
    },
  });
  await recordAuditEvent(auditCtx(actor), {
    eventType: 'CRM_AUTOMATION',
    action: 'RULE_CREATED',
    resourceType: 'CrmAutomationRule',
    resourceId: rule.id,
    metadata: { trigger: dto.trigger, action: action.type, conditions: dto.conditions.length },
  });
  return rule;
}

export async function listRules(actor: CrmActor) {
  requireManage(actor);
  return prisma.crmAutomationRule.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    include: { _count: { select: { executions: true } } },
  });
}

export async function setRuleEnabled(id: string, enabled: boolean, actor: CrmActor) {
  requireManage(actor);
  const rule = await prisma.crmAutomationRule.findUnique({ where: { id } });
  if (!rule) throw new NotFoundError('Rule not found');
  if (rule.enabled === enabled) return rule;
  const updated = await prisma.crmAutomationRule.update({ where: { id }, data: { enabled } });
  await recordAuditEvent(auditCtx(actor), {
    eventType: 'CRM_AUTOMATION',
    action: enabled ? 'RULE_ENABLED' : 'RULE_DISABLED',
    resourceType: 'CrmAutomationRule',
    resourceId: id,
  });
  return updated;
}

// ------------------------------------------------------------------- execution

type RuleRow = Awaited<ReturnType<typeof prisma.crmAutomationRule.findMany>>[number];

// Runs one action on one lead. Returns a short outcome for the execution record.
async function performAction(rule: RuleRow, leadId: string, createdById: string): Promise<string> {
  const config = rule.actionConfig as Record<string, unknown>;
  const lead = await prisma.crmLead.findUnique({ where: { id: leadId } });
  if (!lead) return 'lead missing';

  switch (rule.action) {
    case 'ASSIGN_TO_USER': {
      const userId = String(config.userId);
      await prisma.crmLead.update({
        where: { id: leadId },
        data: {
          assignedToId: userId,
          assignments: { create: { fromUserId: lead.assignedToId, toUserId: userId, actorId: createdById, reason: `Rule: ${rule.name}` } },
          activities: { create: { type: 'ASSIGNMENT', summary: `Assigned by rule "${rule.name}"`, actorId: createdById } },
        },
      });
      return `assigned to ${userId}`;
    }
    case 'CREATE_TASK': {
      const minutes = Number(config.dueInMinutes ?? 0);
      await prisma.crmTask.create({
        data: {
          title: String(config.title),
          type: 'FOLLOW_UP',
          priority: 'MEDIUM',
          dueAt: new Date(Date.now() + minutes * 60 * 1000),
          leadId,
          assignedToId: lead.assignedToId ?? createdById,
          createdById,
        },
      });
      return 'task created';
    }
    case 'NOTIFY_OWNER': {
      if (!lead.assignedToId) return 'no owner to notify';
      await notify(lead.assignedToId, 'IN_APP', 'crm.automation', { message: String(config.message), leadId });
      return 'owner notified';
    }
    case 'SET_PRIORITY': {
      await prisma.crmLead.update({ where: { id: leadId }, data: { priority: String(config.priority) } });
      return `priority ${String(config.priority)}`;
    }
    default:
      return 'unknown action';
  }
}

// Claims the (rule, lead) pair first. The unique key makes a second run a no-op,
// so a trigger that fires twice never repeats an action.
async function runRuleOnLead(rule: RuleRow, leadId: string, actorId: string) {
  try {
    await prisma.crmAutomationExecution.create({ data: { ruleId: rule.id, leadId, status: 'RUNNING' } });
  } catch {
    return null; // already ran for this lead
  }
  try {
    const detail = await performAction(rule, leadId, actorId);
    await prisma.crmAutomationExecution.update({
      where: { ruleId_leadId: { ruleId: rule.id, leadId } },
      data: { status: 'DONE', detail },
    });
    await recordAuditEvent({ userId: actorId }, {
      eventType: 'CRM_AUTOMATION',
      action: 'EXECUTED',
      resourceType: 'CrmLead',
      resourceId: leadId,
      metadata: { rule: rule.name, action: rule.action, detail },
    });
    return 'DONE';
  } catch (err) {
    const message = err instanceof Error ? err.message : 'failed';
    await prisma.crmAutomationExecution.update({
      where: { ruleId_leadId: { ruleId: rule.id, leadId } },
      data: { status: 'FAILED', detail: message.slice(0, 300) },
    });
    return 'FAILED';
  }
}

// Called when a lead is created. Failures are recorded on the execution row and
// never fail the lead creation.
export async function runLeadCreatedRules(leadId: string, actorId: string) {
  const rules = await prisma.crmAutomationRule.findMany({ where: { enabled: true, trigger: 'LEAD_CREATED' } });
  if (!rules.length) return;
  const lead = await prisma.crmLead.findUnique({ where: { id: leadId } });
  if (!lead) return;
  for (const rule of rules) {
    if (!ruleMatches(lead, rule.conditions as unknown as Condition[])) continue;
    await runRuleOnLead(rule, leadId, actorId);
  }
}

// Leads with no contact for 48 hours that still need work. Run by an admin, and
// later by a scheduled job. Each lead is handled once per rule.
export async function runIdleCheck(actor: CrmActor, now = new Date()) {
  requireManage(actor);
  const rules = await prisma.crmAutomationRule.findMany({ where: { enabled: true, trigger: 'LEAD_IDLE' } });
  if (!rules.length) return { checked: 0, actedOn: 0 };
  const leads = await prisma.crmLead.findMany({
    where: { stage: { notIn: [...CLOSED_STAGES] } },
    select: { id: true, source: true, city: true, interestedService: true, priority: true, stage: true, lastContactedAt: true, createdAt: true },
    take: 500,
  });
  let actedOn = 0;
  for (const lead of leads) {
    if (!isIdle(lead.lastContactedAt, lead.createdAt, now)) continue;
    for (const rule of rules) {
      if (!ruleMatches(lead, rule.conditions as unknown as Condition[])) continue;
      if ((await runRuleOnLead(rule, lead.id, actor.userId)) !== null) actedOn += 1;
    }
  }
  return { checked: leads.length, actedOn };
}
