import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  exportLeadsCsv,
  listCrmAudit,
  listDuplicateGroups,
  mergeLeads,
} from '@abies/domain/modules/crm/enterprise.service';
import type { CrmActor } from '@abies/domain/modules/crm/rbac';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../packages/domain/src/lib/errors';

// In-memory store for the Prisma models the enterprise service touches. The
// `where` evaluator honours AND / OR, equality, `in` and `notIn`, and `take`
// is applied, so the export cap and the closed-stage filter are checked
// against real rows.
const h = vi.hoisted(() => {
  type Row = Record<string, any> & { id?: string };
  const store: Record<'crmLead' | 'crmActivity' | 'crmTask' | 'crmOpportunity' | 'crmLeadTag' | 'auditEvent', Row[]> = {
    crmLead: [],
    crmActivity: [],
    crmTask: [],
    crmOpportunity: [],
    crmLeadTag: [],
    auditEvent: [],
  };

  function matches(row: Row, where: any = {}): boolean {
    for (const [key, cond] of Object.entries(where as Record<string, any>)) {
      if (cond === undefined) continue;
      if (key === 'OR') {
        if (!cond.some((w: any) => matches(row, w))) return false;
        continue;
      }
      if (key === 'AND') {
        if (!cond.every((w: any) => matches(row, w))) return false;
        continue;
      }
      const value = row[key];
      if (cond !== null && typeof cond === 'object' && !(cond instanceof Date)) {
        if ('notIn' in cond && cond.notIn.includes(value)) return false;
        if ('in' in cond && !cond.in.includes(value)) return false;
        continue;
      }
      if (value !== cond) return false;
    }
    return true;
  }

  const prismaMock: any = {
    crmLead: {
      findMany: vi.fn(async ({ where, take }: any = {}) => {
        const rows = store.crmLead.filter((r) => matches(r, where));
        return take ? rows.slice(0, take) : rows;
      }),
      findUnique: vi.fn(async ({ where, include }: any) => {
        const row = store.crmLead.find((r) => r.id === where.id);
        if (!row) return null;
        const copy = { ...row };
        if (include?.tags) copy.tags = store.crmLeadTag.filter((t) => t.leadId === row.id).map((t) => ({ ...t }));
        return copy;
      }),
      update: vi.fn(async ({ where, data }: any) => {
        const row = store.crmLead.find((r) => r.id === where.id);
        if (!row) throw new Error(`no crmLead row ${where.id}`);
        const { activities, ...rest } = data;
        Object.assign(row, rest);
        if (activities?.create) store.crmActivity.push({ id: `act-${store.crmActivity.length + 1}`, leadId: row.id, ...activities.create });
        return row;
      }),
    },
    crmActivity: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        const hit = store.crmActivity.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      }),
    },
    crmTask: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        const hit = store.crmTask.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      }),
    },
    crmOpportunity: {
      updateMany: vi.fn(async ({ where, data }: any) => {
        const hit = store.crmOpportunity.filter((r) => matches(r, where));
        hit.forEach((r) => Object.assign(r, data));
        return { count: hit.length };
      }),
    },
    crmLeadTag: {
      create: vi.fn(async ({ data }: any) => {
        store.crmLeadTag.push({ ...data });
        return data;
      }),
      deleteMany: vi.fn(async ({ where }: any) => {
        const before = store.crmLeadTag.length;
        const kept = store.crmLeadTag.filter((r) => !matches(r, where));
        store.crmLeadTag.splice(0, store.crmLeadTag.length, ...kept);
        return { count: before - kept.length };
      }),
    },
    auditEvent: {
      findMany: vi.fn(async ({ where, take }: any = {}) => {
        const rows = store.auditEvent.filter((r) => matches(r, where));
        return take ? rows.slice(0, take) : rows;
      }),
    },
  };
  // The transaction client is the same mock, so writes inside the callback
  // land in the same store and call counts.
  prismaMock.$transaction = vi.fn(async (fn: any) => fn(prismaMock));

  const recordAuditEventMock = vi.fn(async () => undefined);
  return { store, prismaMock, recordAuditEventMock };
});

vi.mock('../../packages/domain/src/lib/db', () => ({ prisma: h.prismaMock }));
vi.mock('../../packages/domain/src/server/audit', () => ({ recordAuditEvent: h.recordAuditEventMock }));

const { store, prismaMock, recordAuditEventMock } = h;

const admin = (): CrmActor => ({ userId: 'admin-1', role: 'ADMIN', mfaVerified: true, sessionId: 's-admin', ip: '10.0.0.1', userAgent: 'ua' });
const crmAdmin = (): CrmActor => ({ userId: 'crm-1', role: 'CRM_ADMIN', sessionId: 's-crm' });
const auditor = (): CrmActor => ({ userId: 'aud-1', role: 'AUDITOR', sessionId: 's-aud' });
const sales = (): CrmActor => ({ userId: 'agent-7', role: 'SALES', sessionId: 's-sales' });
const marketing = (): CrmActor => ({ userId: 'mkt-1', role: 'MARKETING', sessionId: 's-mkt' });

function seedLead(overrides: Record<string, unknown> = {}) {
  const row = {
    id: `L-${store.crmLead.length + 1}`,
    firstName: 'Asha',
    lastName: 'Rao',
    mobile: '+919876543210',
    email: 'asha@example.com',
    city: 'Pune',
    state: 'MH',
    source: 'WEB',
    campaign: null,
    stage: 'NEW',
    priority: 'MEDIUM',
    createdAt: new Date('2026-09-01T10:00:00Z'),
    lastContactedAt: null,
    assignedTo: { name: 'Ravi' },
    ...overrides,
  };
  store.crmLead.push(row);
  return row;
}

function seedTag(leadId: string, tagId: string) {
  store.crmLeadTag.push({ leadId, tagId });
}

beforeEach(() => {
  store.crmLead.length = 0;
  store.crmActivity.length = 0;
  store.crmTask.length = 0;
  store.crmOpportunity.length = 0;
  store.crmLeadTag.length = 0;
  store.auditEvent.length = 0;
  vi.clearAllMocks();
});

// ----------------------------------------------------------- 1. export roles

describe('exportLeadsCsv roles', () => {
  it('refuses SALES and MARKETING with ForbiddenError', async () => {
    seedLead();
    await expect(exportLeadsCsv(sales())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(exportLeadsCsv(marketing())).rejects.toBeInstanceOf(ForbiddenError);
    expect(prismaMock.crmLead.findMany).not.toHaveBeenCalled();
    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });

  it('allows ADMIN (with MFA), CRM_ADMIN and AUDITOR', async () => {
    seedLead();
    await expect(exportLeadsCsv(admin())).resolves.toMatchObject({ rows: 1 });
    await expect(exportLeadsCsv(crmAdmin())).resolves.toMatchObject({ rows: 1 });
    await expect(exportLeadsCsv(auditor())).resolves.toMatchObject({ rows: 1 });
  });
});

// ------------------------------------------------------------- 2. masking

describe('exportLeadsCsv masking', () => {
  it('masks the mobile to the last four digits and blanks the email for AUDITOR', async () => {
    seedLead();
    const { csv } = await exportLeadsCsv(auditor());
    expect(csv).not.toContain('+919876543210');
    expect(csv).not.toContain('9876543210');
    expect(csv).toContain(',*********3210,');
    expect(csv).not.toContain('asha@example.com');
  });

  it('shows the mobile and email in full for CRM_ADMIN', async () => {
    seedLead();
    const { csv } = await exportLeadsCsv(crmAdmin());
    expect(csv).toContain(',+919876543210,');
    expect(csv).toContain(',asha@example.com,');
  });
});

// ------------------------------------------------------------- 3. CSV quoting

describe('exportLeadsCsv quoting', () => {
  it('quotes cells with commas, quotes or newlines and doubles embedded quotes', async () => {
    seedLead({ firstName: 'Say "hi", ok', lastName: 'Line\nBreak' });
    const { csv } = await exportLeadsCsv(crmAdmin());
    expect(csv).toContain('"Say ""hi"", ok"');
    expect(csv).toContain('"Line\nBreak"');
  });

  it('leaves plain cells unquoted', async () => {
    seedLead({ firstName: 'Plain', lastName: 'Name' });
    const { csv } = await exportLeadsCsv(crmAdmin());
    const dataRow = csv.split('\n')[1];
    expect(dataRow).toContain(',Plain,Name,');
    expect(dataRow).not.toContain('"Plain"');
  });
});

// ------------------------------------------------------------- 4. cap + audit

describe('exportLeadsCsv cap and audit', () => {
  it('asks for at most 5000 rows and caps the output at 5000', async () => {
    for (let i = 0; i < 5001; i++) seedLead({ id: `bulk-${i}`, mobile: null, email: null });
    const result = await exportLeadsCsv(crmAdmin());
    expect(prismaMock.crmLead.findMany).toHaveBeenCalledWith(expect.objectContaining({ take: 5000 }));
    expect(result.rows).toBe(5000);
    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ metadata: expect.objectContaining({ rows: 5000, capped: true }) }),
    );
  });

  it('records a CRM_EXPORT audit event with the row count and filter', async () => {
    seedLead({ stage: 'NEW', source: 'WEB' });
    seedLead({ stage: 'NEW', source: 'WEB' });
    await exportLeadsCsv(admin(), { stage: 'NEW', source: 'WEB' });
    expect(prismaMock.crmLead.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { stage: 'NEW', source: 'WEB' } }),
    );
    expect(recordAuditEventMock).toHaveBeenCalledTimes(1);
    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'admin-1', sessionId: 's-admin', ip: '10.0.0.1', userAgent: 'ua' }),
      expect.objectContaining({
        eventType: 'CRM_EXPORT',
        metadata: expect.objectContaining({ rows: 2, filter: { stage: 'NEW', source: 'WEB' } }),
      }),
    );
  });
});

// ------------------------------------------------------- 5. duplicate groups

describe('listDuplicateGroups', () => {
  it('is available only to ADMIN and CRM_ADMIN', async () => {
    await expect(listDuplicateGroups(sales())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listDuplicateGroups(auditor())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listDuplicateGroups(marketing())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listDuplicateGroups(crmAdmin())).resolves.toEqual([]);
    await expect(listDuplicateGroups(admin())).resolves.toEqual([]);
  });

  it('groups leads that share a mobile, matched on mobile', async () => {
    const a = seedLead({ mobile: '+911111111111', email: 'a@x.test' });
    const b = seedLead({ mobile: '+911111111111', email: 'b@x.test' });
    const groups = await listDuplicateGroups(crmAdmin());
    const mobileGroup = groups.find((g) => g.leads.some((l) => l.id === a.id));
    expect(mobileGroup?.matchedOn).toBe('mobile');
    expect(mobileGroup?.leads.map((l) => l.id).sort()).toEqual([a.id, b.id].sort());
  });

  it('groups leads that share only an email, matched on email', async () => {
    const c = seedLead({ mobile: '+912222222222', email: 'same@x.test' });
    const d = seedLead({ mobile: '+913333333333', email: 'same@x.test' });
    const groups = await listDuplicateGroups(crmAdmin());
    const emailGroup = groups.find((g) => g.leads.some((l) => l.id === c.id));
    expect(emailGroup?.matchedOn).toBe('email');
    expect(emailGroup?.leads.map((l) => l.id).sort()).toEqual([c.id, d.id].sort());
  });

  it('does not report single leads, nor closed leads', async () => {
    const solo = seedLead({ mobile: '+919999999991', email: 'solo@x.test' });
    seedLead({ mobile: '+919999999992', email: 'closed@x.test', stage: 'CONVERTED' });
    seedLead({ mobile: '+919999999992', email: 'closed2@x.test', stage: 'NEW' });
    const groups = await listDuplicateGroups(crmAdmin());
    expect(groups.flatMap((g) => g.leads.map((l) => l.id))).not.toContain(solo.id);
    expect(groups).toEqual([]);
  });

  it('reports a pair that matches on both mobile and email only once', async () => {
    const g = seedLead({ mobile: '+915555555555', email: 'both@x.test' });
    const h2 = seedLead({ mobile: '+915555555555', email: 'both@x.test' });
    const groups = await listDuplicateGroups(crmAdmin());
    const containing = groups.filter((grp) => grp.leads.some((l) => l.id === g.id));
    expect(containing).toHaveLength(1);
    expect(containing[0].leads.map((l) => l.id).sort()).toEqual([g.id, h2.id].sort());
  });
});

// ------------------------------------------------------------------ 6. merge roles

describe('mergeLeads roles', () => {
  it('refuses SALES and MARKETING with ForbiddenError', async () => {
    const t = seedLead({ id: 'T1' });
    const s = seedLead({ id: 'S1' });
    await expect(mergeLeads(t.id, s.id, 'dup', sales())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(mergeLeads(t.id, s.id, 'dup', marketing())).rejects.toBeInstanceOf(ForbiddenError);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------- 7-8. merge guards

describe('mergeLeads guards', () => {
  it('refuses to merge a lead into itself', async () => {
    const t = seedLead({ id: 'SELF' });
    await expect(mergeLeads(t.id, t.id, 'dup', crmAdmin())).rejects.toBeInstanceOf(BadRequestError);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a source already marked DUPLICATE', async () => {
    const t = seedLead({ id: 'T2' });
    const s = seedLead({ id: 'S2', stage: 'DUPLICATE' });
    await expect(mergeLeads(t.id, s.id, 'dup', crmAdmin())).rejects.toBeInstanceOf(BadRequestError);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('refuses a target marked DUPLICATE', async () => {
    const t = seedLead({ id: 'T3', stage: 'DUPLICATE' });
    const s = seedLead({ id: 'S3' });
    await expect(mergeLeads(t.id, s.id, 'dup', crmAdmin())).rejects.toBeInstanceOf(BadRequestError);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------- 9. merge moves data

describe('mergeLeads moves data', () => {
  it('moves activities, tasks and opportunities, marks the source DUPLICATE and audits once', async () => {
    const t = seedLead({ id: 'T4' });
    const s = seedLead({ id: 'S4' });
    store.crmActivity.push({ id: 'a1', leadId: 'S4' });
    store.crmTask.push({ id: 'k1', leadId: 'S4' });
    store.crmOpportunity.push({ id: 'o1', leadId: 'S4' });

    await mergeLeads(t.id, s.id, 'same person', crmAdmin());

    expect(prismaMock.crmActivity.updateMany).toHaveBeenCalledWith({ where: { leadId: 'S4' }, data: { leadId: 'T4' } });
    expect(prismaMock.crmTask.updateMany).toHaveBeenCalledWith({ where: { leadId: 'S4' }, data: { leadId: 'T4' } });
    expect(prismaMock.crmOpportunity.updateMany).toHaveBeenCalledWith({ where: { leadId: 'S4' }, data: { leadId: 'T4' } });
    expect(store.crmActivity[0].leadId).toBe('T4');
    expect(store.crmTask[0].leadId).toBe('T4');
    expect(store.crmOpportunity[0].leadId).toBe('T4');

    expect(store.crmLead.find((r) => r.id === 'S4')?.stage).toBe('DUPLICATE');
    expect(store.crmLead.find((r) => r.id === 'T4')?.stage).toBe('NEW');

    expect(recordAuditEventMock).toHaveBeenCalledTimes(1);
    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'crm-1' }),
      expect.objectContaining({
        eventType: 'CRM_LEAD',
        action: 'MERGED',
        resourceType: 'CrmLead',
        resourceId: 'T4',
        metadata: expect.objectContaining({ sourceId: 'S4', targetId: 'T4' }),
      }),
    );
  });
});

// ------------------------------------------------------- 10. tag merge

describe('mergeLeads tags', () => {
  it('copies only tags the target lacks and removes the source tag links', async () => {
    seedLead({ id: 'T5' });
    seedLead({ id: 'S5' });
    seedTag('T5', 't1');
    seedTag('S5', 't1');
    seedTag('S5', 't2');

    await mergeLeads('T5', 'S5', 'dup', crmAdmin());

    expect(prismaMock.crmLeadTag.create).toHaveBeenCalledTimes(1);
    expect(prismaMock.crmLeadTag.create).toHaveBeenCalledWith({ data: { leadId: 'T5', tagId: 't2' } });
    expect(prismaMock.crmLeadTag.deleteMany).toHaveBeenCalledWith({ where: { leadId: 'S5' } });
    expect(store.crmLeadTag.filter((t) => t.leadId === 'S5')).toEqual([]);
    expect(store.crmLeadTag.filter((t) => t.leadId === 'T5').map((t) => t.tagId).sort()).toEqual(['t1', 't2']);
  });
});

// ------------------------------------------------------- 11. second merge

describe('mergeLeads repeated merge', () => {
  it('fails the second merge of the same source and moves nothing again', async () => {
    seedLead({ id: 'T6' });
    seedLead({ id: 'S6' });
    store.crmActivity.push({ id: 'a6', leadId: 'S6' });

    await mergeLeads('T6', 'S6', 'dup', crmAdmin());
    const updateCallsAfterFirst = prismaMock.crmActivity.updateMany.mock.calls.length;
    const txCallsAfterFirst = prismaMock.$transaction.mock.calls.length;
    const auditCallsAfterFirst = recordAuditEventMock.mock.calls.length;

    await expect(mergeLeads('T6', 'S6', 'dup again', crmAdmin())).rejects.toBeInstanceOf(BadRequestError);

    expect(prismaMock.crmActivity.updateMany).toHaveBeenCalledTimes(updateCallsAfterFirst);
    expect(prismaMock.$transaction).toHaveBeenCalledTimes(txCallsAfterFirst);
    expect(recordAuditEventMock).toHaveBeenCalledTimes(auditCallsAfterFirst);
    expect(store.crmActivity[0].leadId).toBe('T6');
  });
});

// ------------------------------------------------------- 13. missing ids

describe('mergeLeads missing leads', () => {
  it('throws NotFoundError when the target id is missing', async () => {
    seedLead({ id: 'S7' });
    await expect(mergeLeads('missing-target', 'S7', 'dup', crmAdmin())).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });

  it('throws NotFoundError when the source id is missing', async () => {
    seedLead({ id: 'T8' });
    await expect(mergeLeads('T8', 'missing-source', 'dup', crmAdmin())).rejects.toBeInstanceOf(NotFoundError);
    expect(prismaMock.$transaction).not.toHaveBeenCalled();
  });
});

// ------------------------------------------------------- 12. audit view

describe('listCrmAudit', () => {
  beforeEach(() => {
    store.auditEvent.push(
      { id: 'e1', eventType: 'CRM_LEAD', action: 'MERGED', resourceType: 'CrmLead', resourceId: 'x', userId: 'u', metadata: {}, createdAt: new Date() },
      { id: 'e2', eventType: 'AUTH', action: 'LOGIN', resourceType: 'User', resourceId: 'y', userId: 'u', metadata: {}, createdAt: new Date() },
    );
  });

  it('is available only to ADMIN, CRM_ADMIN and AUDITOR', async () => {
    await expect(listCrmAudit(sales())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listCrmAudit(marketing())).rejects.toBeInstanceOf(ForbiddenError);
    await expect(listCrmAudit(crmAdmin())).resolves.toHaveLength(1);
    await expect(listCrmAudit(auditor())).resolves.toHaveLength(1);
    await expect(listCrmAudit(admin())).resolves.toHaveLength(1);
  });

  it('filters eventType to CRM event types and caps the limit at 200', async () => {
    await listCrmAudit(crmAdmin(), 500);
    expect(prismaMock.auditEvent.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { eventType: { in: ['CRM_LEAD', 'CRM_OPPORTUNITY', 'CRM_TASK', 'CRM_AUTOMATION', 'CRM_EXPORT'] } },
        take: 200,
      }),
    );
  });

  it('returns only CRM events', async () => {
    const rows = await listCrmAudit(auditor());
    expect(rows.map((r) => r.eventType)).toEqual(['CRM_LEAD']);
  });
});
