import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createRule,
  listRules,
  runIdleCheck,
  runLeadCreatedRules,
  setRuleEnabled,
} from '@abies/domain/modules/crm/automation.service';
import { createRuleSchema, type CreateRuleInput } from '@abies/domain/modules/crm/automation.schemas';
import type { CrmActor } from '@abies/domain/modules/crm/rbac';
import { BadRequestError, ForbiddenError } from '../../packages/domain/src/lib/errors';

// In-memory store for the Prisma models the automation service touches. The
// execution table enforces the (ruleId, leadId) unique key the way Postgres does.
const h = vi.hoisted(() => {
  type Row = Record<string, any> & { id: string };
  type Name = 'crmAutomationRule' | 'crmLead' | 'crmTask' | 'user';
  const store: Record<Name, Row[]> = { crmAutomationRule: [], crmLead: [], crmTask: [], user: [] };
  const executions = new Map<string, Record<string, any>>();
  let seq = 0;

  function matchesWhere(row: Row, where: any): boolean {
    if (!where) return true;
    for (const [key, cond] of Object.entries(where)) {
      if (cond === undefined) continue;
      const value = row[key];
      if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
        const c = cond as Record<string, any>;
        if ('notIn' in c && c.notIn.includes(value)) return false;
        if ('in' in c && !c.in.includes(value)) return false;
        continue;
      }
      if (value !== cond) return false;
    }
    return true;
  }

  const ruleModel = {
    findUnique: vi.fn(({ where }: any) => store.crmAutomationRule.find((r) => r.id === where.id) ?? null),
    findMany: vi.fn(({ where }: any = {}) => store.crmAutomationRule.filter((r) => matchesWhere(r, where))),
    create: vi.fn(({ data }: any) => {
      const row = { id: `rule-${++seq}`, enabled: true, ...data };
      store.crmAutomationRule.push(row);
      return row;
    }),
    update: vi.fn(({ where, data }: any) => {
      const row = store.crmAutomationRule.find((r) => r.id === where.id);
      if (!row) throw new Error(`no rule ${where.id}`);
      Object.assign(row, data);
      return row;
    }),
  };

  const leadModel = {
    findUnique: vi.fn(({ where }: any) => store.crmLead.find((r) => r.id === where.id) ?? null),
    findMany: vi.fn(({ where }: any = {}) => store.crmLead.filter((r) => matchesWhere(r, where))),
    update: vi.fn(({ where, data }: any) => {
      const row = store.crmLead.find((r) => r.id === where.id);
      if (!row) throw new Error(`no lead ${where.id}`);
      const { assignments, activities, ...rest } = data;
      Object.assign(row, rest);
      return row;
    }),
  };

  const taskModel = {
    create: vi.fn(({ data }: any) => {
      const row = { id: `task-${++seq}`, ...data };
      store.crmTask.push(row);
      return row;
    }),
  };

  const userModel = {
    findUnique: vi.fn(({ where }: any) => store.user.find((r) => r.id === where.id) ?? null),
  };

  const executionModel = {
    // Throws on a repeat (ruleId, leadId), like the unique index does.
    create: vi.fn(({ data }: any) => {
      const key = `${data.ruleId}:${data.leadId}`;
      if (executions.has(key)) throw new Error('Unique constraint failed on the fields: (`ruleId`,`leadId`)');
      const row = { id: `exec-${++seq}`, ...data };
      executions.set(key, row);
      return row;
    }),
    update: vi.fn(({ where, data }: any) => {
      const key = `${where.ruleId_leadId.ruleId}:${where.ruleId_leadId.leadId}`;
      const row = executions.get(key);
      if (!row) throw new Error(`no execution ${key}`);
      Object.assign(row, data);
      return row;
    }),
  };

  const prismaMock: any = {
    crmAutomationRule: ruleModel,
    crmAutomationExecution: executionModel,
    crmLead: leadModel,
    crmTask: taskModel,
    user: userModel,
  };

  const recordAuditEventMock = vi.fn(async () => undefined);
  const notifyMock = vi.fn(async () => ({ id: 'n-1' }));
  return { store, executions, prismaMock, recordAuditEventMock, notifyMock };
});

vi.mock('../../packages/domain/src/lib/db', () => ({ prisma: h.prismaMock }));
vi.mock('../../packages/domain/src/server/audit', () => ({ recordAuditEvent: h.recordAuditEventMock }));
vi.mock('../../packages/domain/src/modules/notifications/notifications.service', () => ({ notify: h.notifyMock }));

const { store, executions, prismaMock, recordAuditEventMock, notifyMock } = h;

const admin = (): CrmActor => ({ userId: 'admin-1', role: 'ADMIN', mfaVerified: true, sessionId: 's-admin' });
const crmAdmin = (): CrmActor => ({ userId: 'crma-1', role: 'CRM_ADMIN', sessionId: 's-crma' });
const sales = (): CrmActor => ({ userId: 'agent-7', role: 'SALES', sessionId: 's-sales' });
const marketing = (): CrmActor => ({ userId: 'mkt-1', role: 'MARKETING', sessionId: 's-mkt' });

const NOW = new Date('2026-10-06T12:00:00Z');
const hoursAgo = (h: number) => new Date(NOW.getTime() - h * 60 * 60 * 1000);

function seedRule(overrides: Record<string, unknown> = {}) {
  const row = {
    id: 'rule-1',
    name: 'Website leads',
    enabled: true,
    trigger: 'LEAD_CREATED',
    conditions: [],
    action: 'SET_PRIORITY',
    actionConfig: { type: 'SET_PRIORITY', priority: 'HIGH' },
    createdById: 'admin-1',
    ...overrides,
  };
  store.crmAutomationRule.push(row);
  return row;
}

function seedLead(overrides: Record<string, unknown> = {}) {
  const row = {
    id: 'lead-1',
    source: 'WEBSITE',
    city: 'Mumbai',
    interestedService: 'AMC',
    priority: 'MEDIUM',
    stage: 'NEW',
    assignedToId: 'agent-7',
    createdById: 'agent-7',
    createdAt: hoursAgo(1),
    lastContactedAt: null,
    ...overrides,
  };
  store.crmLead.push(row);
  return row;
}

function seedUser(id: string, status = 'ACTIVE') {
  store.user.push({ id, name: id, status, role: 'SALES' });
}

// Reads the execution row the service wrote for a (rule, lead) pair.
const executionFor = (ruleId: string, leadId: string) => executions.get(`${ruleId}:${leadId}`);

beforeEach(() => {
  for (const rows of Object.values(store)) rows.length = 0;
  executions.clear();
  vi.clearAllMocks();
  seedUser('agent-7');
  seedUser('user-inactive', 'SUSPENDED');
});

describe('runLeadCreatedRules idempotency', () => {
  it('running the same lead twice runs the action once', async () => {
    seedRule({ id: 'rule-1', action: 'CREATE_TASK', actionConfig: { type: 'CREATE_TASK', title: 'Call back', dueInMinutes: 30 } });
    seedLead({ id: 'lead-1' });

    await runLeadCreatedRules('lead-1', 'agent-7');
    await runLeadCreatedRules('lead-1', 'agent-7');

    // The second attempt hits the unique key and is swallowed.
    expect(prismaMock.crmAutomationExecution.create).toHaveBeenCalledTimes(2);
    expect(prismaMock.crmAutomationExecution.create.mock.results[1].type).toBe('throw');
    expect(prismaMock.crmTask.create).toHaveBeenCalledTimes(1);
    expect(store.crmTask).toHaveLength(1);
    expect(executionFor('rule-1', 'lead-1')).toMatchObject({ status: 'DONE' });
  });
});

describe('runLeadCreatedRules failure handling', () => {
  it('a failing action marks the execution FAILED with detail and does not throw', async () => {
    seedRule({ id: 'rule-1', action: 'SET_PRIORITY', actionConfig: { type: 'SET_PRIORITY', priority: 'HIGH' } });
    seedLead({ id: 'lead-1' });
    prismaMock.crmLead.update.mockRejectedValueOnce(new Error('lead row is locked'));

    await expect(runLeadCreatedRules('lead-1', 'agent-7')).resolves.toBeUndefined();

    expect(executionFor('rule-1', 'lead-1')).toMatchObject({ status: 'FAILED', detail: 'lead row is locked' });
    expect(notifyMock).not.toHaveBeenCalled();
  });

  it('a rule whose conditions do not match runs no action and creates no execution row', async () => {
    seedRule({
      id: 'rule-1',
      conditions: [{ field: 'city', op: 'equals', value: 'Pune' }],
      action: 'SET_PRIORITY',
      actionConfig: { type: 'SET_PRIORITY', priority: 'HIGH' },
    });
    seedLead({ id: 'lead-1', city: 'Mumbai' });

    await runLeadCreatedRules('lead-1', 'agent-7');

    expect(prismaMock.crmAutomationExecution.create).not.toHaveBeenCalled();
    expect(prismaMock.crmLead.update).not.toHaveBeenCalled();
    expect(prismaMock.crmTask.create).not.toHaveBeenCalled();
    expect(executions.size).toBe(0);
  });

  it('disabled rules are not loaded (findMany filters enabled: true)', async () => {
    seedRule({ id: 'rule-off', enabled: false, action: 'SET_PRIORITY', actionConfig: { type: 'SET_PRIORITY', priority: 'HIGH' } });
    seedLead({ id: 'lead-1' });

    await runLeadCreatedRules('lead-1', 'agent-7');

    const where = prismaMock.crmAutomationRule.findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ enabled: true, trigger: 'LEAD_CREATED' });
    expect(prismaMock.crmLead.update).not.toHaveBeenCalled();
    expect(executions.size).toBe(0);
  });

  it('NOTIFY_OWNER on a lead with no owner records DONE with "no owner to notify" and does not notify', async () => {
    seedRule({ id: 'rule-1', action: 'NOTIFY_OWNER', actionConfig: { type: 'NOTIFY_OWNER', message: 'New website lead' } });
    seedLead({ id: 'lead-1', assignedToId: null });

    await runLeadCreatedRules('lead-1', 'agent-7');

    expect(prismaMock.crmAutomationExecution.update).toHaveBeenCalledWith({
      where: { ruleId_leadId: { ruleId: 'rule-1', leadId: 'lead-1' } },
      data: { status: 'DONE', detail: 'no owner to notify' },
    });
    expect(executionFor('rule-1', 'lead-1')).toMatchObject({ status: 'DONE', detail: 'no owner to notify' });
    expect(notifyMock).not.toHaveBeenCalled();
  });
});

describe('automation management RBAC', () => {
  const dto = (): CreateRuleInput =>
    createRuleSchema.parse({
      name: 'Website leads',
      trigger: 'LEAD_CREATED',
      conditions: [],
      actionConfig: { type: 'SET_PRIORITY', priority: 'HIGH' },
    });

  it.each([
    ['SALES', sales],
    ['MARKETING', marketing],
  ])('%s actor: createRule, listRules and setRuleEnabled throw ForbiddenError', async (_label, actor) => {
    seedRule({ id: 'rule-1', enabled: true });

    await expect(createRule(dto(), actor())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listRules(actor())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(setRuleEnabled('rule-1', false, actor())).rejects.toBeInstanceOf(ForbiddenError);

    expect(prismaMock.crmAutomationRule.create).not.toHaveBeenCalled();
    expect(prismaMock.crmAutomationRule.findMany).not.toHaveBeenCalled();
    expect(store.crmAutomationRule[0].enabled).toBe(true);
  });

  it.each([
    ['ADMIN', admin],
    ['CRM_ADMIN', crmAdmin],
  ])('%s actor: createRule, listRules and setRuleEnabled succeed', async (_label, actor) => {
    seedRule({ id: 'rule-1', enabled: true });

    const created = await createRule(dto(), actor());
    expect(created).toMatchObject({ name: 'Website leads', trigger: 'LEAD_CREATED' });

    const rules = await listRules(actor());
    expect(rules.length).toBeGreaterThanOrEqual(2);

    const updated = await setRuleEnabled('rule-1', false, actor());
    expect(updated).toMatchObject({ id: 'rule-1', enabled: false });
  });
});

describe('createRule assignment target', () => {
  it('ASSIGN_TO_USER to an inactive user throws BadRequestError', async () => {
    const dto = createRuleSchema.parse({
      name: 'Route to Priya',
      trigger: 'LEAD_CREATED',
      conditions: [],
      actionConfig: { type: 'ASSIGN_TO_USER', userId: 'user-inactive' },
    });

    await expect(createRule(dto, admin())).rejects.toBeInstanceOf(BadRequestError);
    expect(prismaMock.crmAutomationRule.create).not.toHaveBeenCalled();
  });
});

describe('runIdleCheck', () => {
  it('skips a lead contacted within 48 hours and acts on one older than that', async () => {
    seedRule({
      id: 'rule-idle',
      trigger: 'LEAD_IDLE',
      action: 'SET_PRIORITY',
      actionConfig: { type: 'SET_PRIORITY', priority: 'HIGH' },
    });
    seedLead({ id: 'lead-recent', createdAt: hoursAgo(240), lastContactedAt: hoursAgo(2) });
    seedLead({ id: 'lead-stale', createdAt: hoursAgo(240), lastContactedAt: hoursAgo(72) });

    const result = await runIdleCheck(admin(), NOW);

    expect(result).toEqual({ checked: 2, actedOn: 1 });
    expect(prismaMock.crmLead.update).toHaveBeenCalledTimes(1);
    expect(prismaMock.crmLead.update.mock.calls[0][0].where).toEqual({ id: 'lead-stale' });
    expect(executionFor('rule-idle', 'lead-recent')).toBeUndefined();
    expect(executionFor('rule-idle', 'lead-stale')).toMatchObject({ status: 'DONE' });
  });
});
