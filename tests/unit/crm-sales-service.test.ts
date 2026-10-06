import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  closeOpportunity,
  createOpportunity,
  createTask,
  dashboard,
  listOpportunities,
  listTasks,
  updateOpportunity,
  updateTask,
} from '@abies/domain/modules/crm/sales.service';
import {
  createOpportunitySchema,
  createTaskSchema,
  listOpportunitiesSchema,
  listTasksSchema,
  updateTaskSchema,
} from '@abies/domain/modules/crm/sales.schemas';
import type { CrmActor } from '@abies/domain/modules/crm/rbac';
import { BadRequestError, ForbiddenError } from '../../packages/domain/src/lib/errors';

// In-memory store for the Prisma models the sales service touches. A small
// `where` evaluator honours AND / OR, equality, `in`, `gte` and `lt`, so the
// visibility and view filters are checked against real rows.
const h = vi.hoisted(() => {
  type Row = Record<string, any> & { id: string };
  type Name = 'crmOpportunity' | 'crmTask' | 'crmLead' | 'user';
  const store: Record<Name, Row[]> = { crmOpportunity: [], crmTask: [], crmLead: [], user: [] };
  let seq = 0;

  function matchesWhere(row: Row, where: any): boolean {
    if (!where) return true;
    for (const [key, cond] of Object.entries(where)) {
      if (cond === undefined) continue;
      if (key === 'AND') {
        if (!(cond as any[]).every((c) => matchesWhere(row, c))) return false;
        continue;
      }
      if (key === 'OR') {
        if (!(cond as any[]).some((c) => matchesWhere(row, c))) return false;
        continue;
      }
      const value = row[key];
      if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
        const c = cond as Record<string, any>;
        if ('in' in c && !c.in.includes(value)) return false;
        if ('gte' in c && !(value instanceof Date && value.getTime() >= c.gte.getTime())) return false;
        if ('lt' in c && !(value instanceof Date && value.getTime() < c.lt.getTime())) return false;
        continue;
      }
      if (cond instanceof Date) {
        if (!(value instanceof Date && value.getTime() === cond.getTime())) return false;
        continue;
      }
      if (value !== cond) return false;
    }
    return true;
  }

  function model(name: Name) {
    return {
      findFirst: vi.fn(({ where }: any) => store[name].find((r) => matchesWhere(r, where)) ?? null),
      findUnique: vi.fn(({ where }: any) => store[name].find((r) => r.id === where.id) ?? null),
      findMany: vi.fn(({ where }: any = {}) => store[name].filter((r) => matchesWhere(r, where))),
      count: vi.fn(({ where }: any = {}) => store[name].filter((r) => matchesWhere(r, where)).length),
      create: vi.fn(({ data }: any) => {
        const row = { id: `${name}-${++seq}`, ...data };
        store[name].push(row);
        return row;
      }),
      update: vi.fn(({ where, data }: any) => {
        const row = store[name].find((r) => r.id === where.id);
        if (!row) throw new Error(`no ${name} row ${where.id}`);
        const { activities, ...rest } = data;
        for (const [k, v] of Object.entries(rest)) if (v !== undefined) row[k] = v;
        if (activities?.create) row.activities = [...(row.activities ?? []), activities.create];
        return row;
      }),
      aggregate: vi.fn(({ where, _sum, _count }: any) => {
        const rows = store[name].filter((r) => matchesWhere(r, where));
        const out: Record<string, any> = { _count: { _all: rows.length } };
        if (_sum) {
          out._sum = {};
          for (const field of Object.keys(_sum)) out._sum[field] = rows.reduce((s, r) => s + r[field], 0);
        }
        return out;
      }),
      groupBy: vi.fn(async () => []),
    };
  }

  const prismaMock: any = {
    crmOpportunity: model('crmOpportunity'),
    crmTask: model('crmTask'),
    crmLead: model('crmLead'),
    user: model('user'),
    crmActivity: { create: vi.fn(async ({ data }: any) => ({ id: `activity-${++seq}`, ...data })) },
  };
  prismaMock.$transaction = vi.fn(async (fn: any) => fn(prismaMock));

  const recordAuditEventMock = vi.fn(async () => undefined);
  return { store, prismaMock, recordAuditEventMock };
});

vi.mock('../../packages/domain/src/lib/db', () => ({ prisma: h.prismaMock }));
vi.mock('../../packages/domain/src/server/audit', () => ({ recordAuditEvent: h.recordAuditEventMock }));

import type { CreateOpportunityInput } from '@abies/domain/modules/crm/sales.schemas';

const { store, prismaMock, recordAuditEventMock } = h;

const admin = (): CrmActor => ({ userId: 'admin-1', role: 'ADMIN', mfaVerified: true, sessionId: 's-admin' });
const sales = (userId = 'agent-7'): CrmActor => ({ userId, role: 'SALES', sessionId: 's-sales' });
const marketing = (): CrmActor => ({ userId: 'mkt-1', role: 'MARKETING', sessionId: 's-mkt' });

const IST_NOW = new Date('2026-10-06T00:30:00+05:30');

function seedOpp(overrides: Record<string, unknown> = {}) {
  const row = {
    id: 'opp-1',
    title: 'Website AMC',
    service: null,
    expectedValue: 10000,
    probability: 50,
    status: 'OPEN',
    ownerId: 'agent-7',
    createdById: 'agent-7',
    leadId: null,
    expectedCloseAt: null,
    wonAt: null,
    lostReason: null,
    ...overrides,
  };
  store.crmOpportunity.push(row);
  return row;
}

function seedTask(overrides: Record<string, unknown> = {}) {
  const row = {
    id: 'task-1',
    title: 'Call Asha',
    status: 'TODO',
    dueAt: null,
    completedAt: null,
    outcome: null,
    leadId: null,
    opportunityId: null,
    assignedToId: 'agent-7',
    createdById: 'agent-7',
    ...overrides,
  };
  store.crmTask.push(row);
  return row;
}

function seedUser(id: string, role: string, status = 'ACTIVE') {
  store.user.push({ id, name: id, role, status, mobile: '+919800000000' });
}

beforeEach(() => {
  for (const rows of Object.values(store)) rows.length = 0;
  seedUser('agent-7', 'SALES');
  seedUser('agent-8', 'SALES');
  seedUser('mkt-x', 'MARKETING');
  seedUser('aud-1', 'AUDITOR');
  vi.clearAllMocks();
});

describe('opportunity visibility', () => {
  it('a SALES agent list is scoped to ownerId or createdById, and only their rows come back', async () => {
    seedOpp({ id: 'opp-1', ownerId: 'agent-7', createdById: 'agent-7' });
    seedOpp({ id: 'opp-2', ownerId: 'agent-8', createdById: 'agent-8' });
    seedOpp({ id: 'opp-3', ownerId: 'agent-8', createdById: 'agent-7' });

    const result = await listOpportunities(listOpportunitiesSchema.parse({}), sales('agent-7'));

    const args = prismaMock.crmOpportunity.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ OR: [{ ownerId: 'agent-7' }, { createdById: 'agent-7' }] });
    expect(result.opportunities.map((o: any) => o.id).sort()).toEqual(['opp-1', 'opp-3']);
  });

  it('a MARKETING actor can read every opportunity but createOpportunity throws ForbiddenError', async () => {
    seedOpp({ id: 'opp-1', ownerId: 'agent-7' });
    seedOpp({ id: 'opp-2', ownerId: 'agent-8', createdById: 'agent-8' });

    const result = await listOpportunities(listOpportunitiesSchema.parse({}), marketing());
    expect(prismaMock.crmOpportunity.findMany.mock.calls[0][0].where).toEqual({});
    expect(result.total).toBe(2);

    const dto = createOpportunitySchema.parse({ title: 'New deal', expectedValue: 1000 }) as CreateOpportunityInput;
    await expect(createOpportunity(dto, marketing())).rejects.toBeInstanceOf(ForbiddenError);
    expect(prismaMock.crmOpportunity.create).not.toHaveBeenCalled();
    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });
});

describe('closing opportunities', () => {
  it('closing a WON opportunity as WON again returns it unchanged and records no audit event', async () => {
    const wonAt = new Date('2026-10-05T10:00:00Z');
    seedOpp({ status: 'WON', wonAt });

    const result = await closeOpportunity('opp-1', 'WON', undefined, admin());

    expect(result).toMatchObject({ id: 'opp-1', status: 'WON', wonAt });
    expect(prismaMock.crmOpportunity.update).not.toHaveBeenCalled();
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });

  it('closing a WON opportunity whose lead is not CONVERTED converts the lead once and writes one STAGE_CHANGE activity', async () => {
    store.crmLead.push({ id: 'lead-1', stage: 'QUALIFIED', assignedToId: 'agent-7', createdById: 'agent-7', activities: [] });
    seedOpp({ leadId: 'lead-1', title: 'Website AMC' });

    await closeOpportunity('opp-1', 'WON', undefined, sales('agent-7'));

    expect(prismaMock.crmLead.update).toHaveBeenCalledTimes(1);
    const lead = store.crmLead[0];
    expect(lead.stage).toBe('CONVERTED');
    expect(lead.convertedAt).toBeInstanceOf(Date);
    expect(lead.activities).toHaveLength(1);
    expect(lead.activities[0]).toMatchObject({ type: 'STAGE_CHANGE', actorId: 'agent-7' });

    // A repeat close is a no-op and must not convert or log again.
    await closeOpportunity('opp-1', 'WON', undefined, sales('agent-7'));
    expect(prismaMock.crmLead.update).toHaveBeenCalledTimes(1);
    expect(lead.activities).toHaveLength(1);
  });

  it('a lead already CONVERTED is not changed when its opportunity is won', async () => {
    const convertedAt = new Date('2026-09-01T00:00:00Z');
    store.crmLead.push({ id: 'lead-1', stage: 'CONVERTED', convertedAt, assignedToId: 'agent-7', createdById: 'agent-7', activities: [] });
    seedOpp({ leadId: 'lead-1' });

    const result = await closeOpportunity('opp-1', 'WON', undefined, sales('agent-7'));

    expect(result.status).toBe('WON');
    expect(prismaMock.crmLead.update).not.toHaveBeenCalled();
    expect(store.crmLead[0]).toMatchObject({ stage: 'CONVERTED', convertedAt });
    expect(store.crmLead[0].activities).toHaveLength(0);
  });

  it('closing a CLOSED opportunity to the other outcome throws BadRequestError', async () => {
    seedOpp({ status: 'WON', wonAt: new Date() });
    await expect(closeOpportunity('opp-1', 'LOST', 'Price', admin())).rejects.toBeInstanceOf(BadRequestError);
    expect(prismaMock.crmOpportunity.update).not.toHaveBeenCalled();

    seedOpp({ id: 'opp-2', status: 'LOST', lostReason: 'Price' });
    await expect(closeOpportunity('opp-2', 'WON', undefined, admin())).rejects.toBeInstanceOf(BadRequestError);
    expect(prismaMock.crmOpportunity.update).not.toHaveBeenCalled();
  });
});

describe('task completion', () => {
  it('completing an already COMPLETED task keeps the original completedAt', async () => {
    const original = new Date('2026-10-05T10:00:00Z');
    seedTask({ status: 'COMPLETED', completedAt: original });

    const dto = updateTaskSchema.parse({ status: 'COMPLETED' });
    await updateTask('task-1', dto, sales('agent-7'), IST_NOW);

    const data = prismaMock.crmTask.update.mock.calls[0][0].data;
    expect(data.completedAt).toBeUndefined();
    expect(store.crmTask[0].completedAt).toEqual(original);
    expect(prismaMock.crmActivity.create).not.toHaveBeenCalled();
  });

  it('completing an open task stamps completedAt with the supplied now', async () => {
    seedTask({ status: 'TODO', leadId: null });

    await updateTask('task-1', updateTaskSchema.parse({ status: 'COMPLETED' }), sales('agent-7'), IST_NOW);

    expect(store.crmTask[0].completedAt).toEqual(IST_NOW);
  });

  it('reopening a completed task clears completedAt', async () => {
    seedTask({ status: 'COMPLETED', completedAt: new Date('2026-10-05T10:00:00Z') });

    await updateTask('task-1', updateTaskSchema.parse({ status: 'TODO' }), sales('agent-7'), IST_NOW);

    expect(prismaMock.crmTask.update.mock.calls[0][0].data.completedAt).toBeNull();
    expect(store.crmTask[0]).toMatchObject({ status: 'TODO', completedAt: null });
  });

  it('a cancelled task cannot be updated (BadRequestError)', async () => {
    seedTask({ status: 'CANCELLED' });

    await expect(
      updateTask('task-1', updateTaskSchema.parse({ status: 'TODO' }), sales('agent-7'), IST_NOW),
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(prismaMock.crmTask.update).not.toHaveBeenCalled();
  });
});

describe('task views and IST day boundary', () => {
  // Rows around the IST midnight for 2026-10-06 (now = 00:30 IST).
  function seedBoundaryTasks() {
    seedTask({ id: 't-today-morning', title: 'A', dueAt: new Date('2026-10-06T10:00:00+05:30') });
    seedTask({ id: 't-yesterday-late', title: 'B', dueAt: new Date('2026-10-05T23:00:00+05:30') });
    seedTask({ id: 't-tomorrow-midnight', title: 'C', dueAt: new Date('2026-10-07T00:00:00+05:30') });
    seedTask({ id: 't-today-start', title: 'D', dueAt: new Date('2026-10-06T00:00:00+05:30') });
    seedTask({ id: 't-utc-date-trap', title: 'E', dueAt: new Date('2026-10-05T20:00:00Z') }); // 01:30 IST on the 6th
  }

  it('"today" contains tasks due on the IST day, and excludes the late-evening IST task from the 5th', async () => {
    seedBoundaryTasks();

    const result = await listTasks(listTasksSchema.parse({ view: 'today' }), admin(), IST_NOW);

    expect(result.tasks.map((t: any) => t.id).sort()).toEqual(['t-today-morning', 't-today-start', 't-utc-date-trap']);
    expect(result.total).toBe(3);
    expect(result.tasks.map((t: any) => t.id)).not.toContain('t-yesterday-late');
  });

  it('a task due 2026-10-05T23:00+05:30 is overdue, not today', async () => {
    seedBoundaryTasks();

    const overdue = await listTasks(listTasksSchema.parse({ view: 'overdue' }), admin(), IST_NOW);
    const today = await listTasks(listTasksSchema.parse({ view: 'today' }), admin(), IST_NOW);

    expect(overdue.tasks.map((t: any) => t.id)).toEqual(['t-yesterday-late']);
    expect(today.tasks.map((t: any) => t.id)).not.toContain('t-yesterday-late');
  });

  it('a task due exactly at the next IST midnight is upcoming, not today', async () => {
    seedBoundaryTasks();

    const upcoming = await listTasks(listTasksSchema.parse({ view: 'upcoming' }), admin(), IST_NOW);
    expect(upcoming.tasks.map((t: any) => t.id)).toEqual(['t-tomorrow-midnight']);
  });
});

describe('assignment rules', () => {
  it('an agent cannot create a task assigned to another user (ForbiddenError)', async () => {
    const dto = createTaskSchema.parse({ title: 'Call Asha', assignedToId: 'agent-8' });

    await expect(createTask(dto, sales('agent-7'))).rejects.toBeInstanceOf(ForbiddenError);
    expect(prismaMock.crmTask.create).not.toHaveBeenCalled();
  });

  it('an agent cannot reassign an existing task (ForbiddenError)', async () => {
    seedTask({ assignedToId: 'agent-7', createdById: 'agent-7' });

    await expect(
      updateTask('task-1', updateTaskSchema.parse({ assignedToId: 'agent-8' }), sales('agent-7'), IST_NOW),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(prismaMock.crmTask.update).not.toHaveBeenCalled();
    expect(store.crmTask[0].assignedToId).toBe('agent-7');
  });

  it('assigning a task to a MARKETING user is rejected with BadRequestError', async () => {
    const dto = createTaskSchema.parse({ title: 'Call Asha', assignedToId: 'mkt-x' });

    await expect(createTask(dto, admin())).rejects.toBeInstanceOf(BadRequestError);
    expect(prismaMock.crmTask.create).not.toHaveBeenCalled();

    seedTask({ assignedToId: 'agent-7' });
    await expect(
      updateTask('task-1', updateTaskSchema.parse({ assignedToId: 'mkt-x' }), admin(), IST_NOW),
    ).rejects.toBeInstanceOf(BadRequestError);
    expect(prismaMock.crmTask.update).not.toHaveBeenCalled();
  });

  it('assigning an opportunity to a MARKETING or AUDITOR user is rejected with BadRequestError', async () => {
    const dto = createOpportunitySchema.parse({ title: 'New deal', expectedValue: 1000, ownerId: 'mkt-x' });
    await expect(createOpportunity(dto, admin())).rejects.toBeInstanceOf(BadRequestError);
    expect(prismaMock.crmOpportunity.create).not.toHaveBeenCalled();

    seedOpp({ ownerId: 'agent-7' });
    await expect(updateOpportunity('opp-1', { ownerId: 'aud-1' } as any, admin())).rejects.toBeInstanceOf(BadRequestError);
    expect(prismaMock.crmOpportunity.update).not.toHaveBeenCalled();
  });

  it('a SALES user is an accepted assignee (positive control)', async () => {
    await createTask(createTaskSchema.parse({ title: 'Call Asha', assignedToId: 'agent-8' }), admin());
    expect(prismaMock.crmTask.create.mock.calls[0][0].data.assignedToId).toBe('agent-8');
  });
});

describe('dashboard weighted pipeline', () => {
  it('sums expectedValue * probability / 100 over OPEN opportunities only', async () => {
    seedOpp({ id: 'o1', status: 'OPEN', expectedValue: 10000, probability: 50 }); // 5000
    seedOpp({ id: 'o2', status: 'OPEN', expectedValue: 1001, probability: 33 }); // 330.33 -> 330
    seedOpp({ id: 'o3', status: 'OPEN', expectedValue: 999, probability: 50 }); // 499.5 -> 500
    seedOpp({ id: 'o4', status: 'WON', expectedValue: 50000, probability: 100, wonAt: new Date() });
    seedOpp({ id: 'o5', status: 'LOST', expectedValue: 20000, probability: 50, lostReason: 'Price' });

    const result = await dashboard(admin(), IST_NOW);

    expect(result.pipeline.openCount).toBe(3);
    expect(result.pipeline.weightedValue).toBe(5830);
    expect(result.won).toEqual({ count: 1, value: 50000 });
  });

  it('spec literal: the weighted total is rounded once, so three deals of 1 at 50% give round(1.5) = 2', async () => {
    // The service rounds each deal first (1 * 50 / 100 = 0.5 -> 1 each), giving 3.
    // The spec says "sum(...), rounded". Product and spec disagree here; see report.
    seedOpp({ id: 'a', status: 'OPEN', expectedValue: 1, probability: 50 });
    seedOpp({ id: 'b', status: 'OPEN', expectedValue: 1, probability: 50 });
    seedOpp({ id: 'c', status: 'OPEN', expectedValue: 1, probability: 50 });

    const result = await dashboard(admin(), IST_NOW);

    expect(result.pipeline.weightedValue).toBe(2);
  });
});
