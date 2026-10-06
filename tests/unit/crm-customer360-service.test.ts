import { beforeEach, describe, expect, it, vi } from 'vitest';
import { customerSummary } from '@abies/domain/modules/crm/customer360.service';
import type { CrmActor } from '@abies/domain/modules/crm/rbac';
import { NotFoundError } from '../../packages/domain/src/lib/errors';

// In-memory store for the Prisma models Customer 360 reads. The `where`
// evaluator honours AND / OR, equality, in / gte / gt / lt / lte / equals / not,
// and relation filters (e.g. refund.payment.payerUserId). `select` projection
// and single-key `orderBy` are honoured too, so the privacy check runs against
// what the service actually asks Prisma for, not against the whole seeded row.
const h = vi.hoisted(() => {
  type Name =
    | 'user'
    | 'crmLead'
    | 'appointment'
    | 'panchakarmaBooking'
    | 'diagnosticOrder'
    | 'medicineOrder'
    | 'payment'
    | 'refund'
    | 'supportTicket'
    | 'crmTask';
  const names: Name[] = [
    'user',
    'crmLead',
    'appointment',
    'panchakarmaBooking',
    'diagnosticOrder',
    'medicineOrder',
    'payment',
    'refund',
    'supportTicket',
    'crmTask',
  ];
  const store = Object.fromEntries(names.map((n) => [n, [] as any[]])) as Record<Name, any[]>;

  const OPS = ['in', 'gte', 'gt', 'lte', 'lt', 'equals', 'not'];

  function eq(a: any, b: any): boolean {
    if (a instanceof Date && b instanceof Date) return a.getTime() === b.getTime();
    return a === b;
  }

  function isOperator(cond: any): boolean {
    return cond !== null && typeof cond === 'object' && !(cond instanceof Date) && Object.keys(cond).some((k) => OPS.includes(k));
  }

  function applyOps(value: any, cond: Record<string, any>): boolean {
    if ('equals' in cond && !eq(value, cond.equals)) return false;
    if ('not' in cond && eq(value, cond.not)) return false;
    if ('in' in cond && !cond.in.some((v: any) => eq(value, v))) return false;
    if ('gte' in cond && !(value instanceof Date && value.getTime() >= cond.gte.getTime())) return false;
    if ('gt' in cond && !(value instanceof Date && value.getTime() > cond.gt.getTime())) return false;
    if ('lte' in cond && !(value instanceof Date && value.getTime() <= cond.lte.getTime())) return false;
    if ('lt' in cond && !(value instanceof Date && value.getTime() < cond.lt.getTime())) return false;
    return true;
  }

  function matches(row: any, where: any): boolean {
    if (!where) return true;
    for (const [key, cond] of Object.entries(where)) {
      if (cond === undefined) continue;
      if (key === 'AND') {
        if (!(cond as any[]).every((c) => matches(row, c))) return false;
        continue;
      }
      if (key === 'OR') {
        if (!(cond as any[]).some((c) => matches(row, c))) return false;
        continue;
      }
      const value = row[key];
      if (cond === null || cond instanceof Date || typeof cond !== 'object') {
        if (!eq(value, cond)) return false;
        continue;
      }
      if (isOperator(cond)) {
        if (!applyOps(value, cond as Record<string, any>)) return false;
        continue;
      }
      // Relation filter, e.g. { payment: { payerUserId: 'x' } }.
      if (!value || !matches(value, cond)) return false;
    }
    return true;
  }

  function project(row: any, select: any): any {
    if (!select) return { ...row };
    const out: Record<string, any> = {};
    for (const [k, v] of Object.entries(select)) {
      if (!v) continue;
      if (v === true) out[k] = row[k];
      else if (typeof v === 'object' && (v as any).select) {
        const inner = row[k];
        out[k] = inner ? project(inner, (v as any).select) : null;
      }
    }
    return out;
  }

  function sortRows(rows: any[], orderBy: any): any[] {
    if (!orderBy) return rows;
    const [[key, dir]] = Object.entries(orderBy) as [string, string][];
    return [...rows].sort((a, b) => {
      const av = a[key];
      const bv = b[key];
      const cmp = av instanceof Date ? av.getTime() - bv.getTime() : av < bv ? -1 : av > bv ? 1 : 0;
      return dir === 'desc' ? -cmp : cmp;
    });
  }

  function model(name: Name) {
    return {
      findFirst: vi.fn(async ({ where, select, orderBy }: any = {}) => {
        const rows = sortRows(store[name].filter((r) => matches(r, where)), orderBy);
        return rows[0] ? project(rows[0], select) : null;
      }),
      count: vi.fn(async ({ where }: any = {}) => store[name].filter((r) => matches(r, where)).length),
      aggregate: vi.fn(async ({ where, _sum, _count }: any = {}) => {
        const rows = store[name].filter((r) => matches(r, where));
        const out: Record<string, any> = { _count: { _all: rows.length } };
        if (_sum) {
          out._sum = {};
          for (const field of Object.keys(_sum)) out._sum[field] = rows.reduce((s, r) => s + (r[field] ?? 0), 0);
        }
        return out;
      }),
    };
  }

  const prismaMock: any = Object.fromEntries(names.map((n) => [n, model(n)]));
  return { store, prismaMock, matches };
});

vi.mock('../../packages/domain/src/lib/db', () => ({ prisma: h.prismaMock }));

const { store, prismaMock } = h;

const NOW = new Date('2026-10-06T06:00:00Z');
const PATIENT_ID = 'pat-1';
const PATIENT_MOBILE = '+919811111111';
const PATIENT_EMAIL = 'asha@example.com';

const sales = (userId = 'agent-7'): CrmActor => ({ userId, role: 'SALES', sessionId: 's-sales' });
const crmAdmin = (): CrmActor => ({ userId: 'crm-1', role: 'CRM_ADMIN', sessionId: 's-crm' });
const admin = (): CrmActor => ({ userId: 'admin-1', role: 'ADMIN', mfaVerified: true, sessionId: 's-admin' });

function seed(name: keyof typeof store, row: Record<string, any>) {
  store[name].push(row);
  return row;
}

function seedPatient(overrides: Record<string, any> = {}) {
  return seed('user', {
    id: PATIENT_ID,
    name: 'Asha Rao',
    mobile: PATIENT_MOBILE,
    email: PATIENT_EMAIL,
    role: 'PATIENT',
    createdAt: new Date('2025-01-10T00:00:00Z'),
    passwordHash: 'should-never-leave-the-service',
    ...overrides,
  });
}

function seedLead(overrides: Record<string, any> = {}) {
  return seed('crmLead', {
    id: 'lead-1',
    mobile: PATIENT_MOBILE,
    email: PATIENT_EMAIL,
    source: 'WEBSITE',
    campaign: 'Winter AMC',
    stage: 'QUALIFIED',
    assignedToId: 'agent-7',
    createdById: 'agent-7',
    assignedTo: { name: 'Ravi Kumar' },
    notes: 'Sensitive lead note',
    ...overrides,
  });
}

// Seeds one row for each operational model, all tied to the patient, with
// clinical and message content on it. The privacy test checks none of it leaks.
function seedClinicalNoise() {
  seed('appointment', {
    id: 'appt-noise',
    patientUserId: PATIENT_ID,
    status: 'COMPLETED',
    scheduledAt: new Date('2026-09-01T10:00:00Z'),
    notes: 'Doctor notes: chronic cough',
    diagnosis: 'Bronchitis',
  });
  seed('panchakarmaBooking', {
    id: 'pk-noise',
    patientUserId: PATIENT_ID,
    status: 'BOOKED',
    createdAt: new Date('2026-08-01T00:00:00Z'),
    notes: 'Therapy notes',
    prescription: 'Oil regimen',
  });
  seed('diagnosticOrder', {
    id: 'dx-noise',
    patientUserId: PATIENT_ID,
    status: 'REPORTED',
    createdAt: new Date('2026-08-02T00:00:00Z'),
    report: { reports: ['blood.pdf'], body: 'Hb 11' },
  });
  seed('medicineOrder', {
    id: 'mo-noise',
    patientUserId: PATIENT_ID,
    status: 'DELIVERED',
    createdAt: new Date('2026-08-03T00:00:00Z'),
    prescription: { prescriptions: ['Ashwagandha 500mg'] },
  });
  seed('supportTicket', {
    id: 'tk-noise',
    requesterUserId: PATIENT_ID,
    status: 'OPEN',
    createdAt: new Date('2026-08-04T00:00:00Z'),
    description: 'Customer description',
    messages: [{ message: 'Please call me about my diagnosis', content: 'private' }],
  });
}

beforeEach(() => {
  for (const rows of Object.values(store)) rows.length = 0;
  vi.clearAllMocks();
});

describe('customerSummary: who can see which customer', () => {
  it('a SALES agent gets NotFoundError for a patient with no visible lead matching mobile or email', async () => {
    seedPatient();
    // Matching lead exists but belongs to another agent, so the SALES actor cannot see it.
    seedLead({ id: 'lead-other', assignedToId: 'agent-8', createdById: 'agent-8' });

    await expect(customerSummary(PATIENT_ID, sales('agent-7'), NOW)).rejects.toBeInstanceOf(NotFoundError);

    // A lead for the same patient by email only, still not theirs: also not found.
    store.crmLead.length = 0;
    seedLead({ id: 'lead-email-other', mobile: '+910000000000', assignedToId: 'agent-8', createdById: 'agent-8' });
    await expect(customerSummary(PATIENT_ID, sales('agent-7'), NOW)).rejects.toBeInstanceOf(NotFoundError);

    // Their own lead, but neither mobile nor email matches the patient: not found.
    store.crmLead.length = 0;
    seedLead({ id: 'lead-unrelated', mobile: '+910000000001', email: 'other@example.com' });
    await expect(customerSummary(PATIENT_ID, sales('agent-7'), NOW)).rejects.toBeInstanceOf(NotFoundError);
  });

  it('the same patient is returned when a visible lead matches by mobile, and by email alone', async () => {
    seedPatient();
    seedLead({ id: 'lead-visible' });

    const byMobile = await customerSummary(PATIENT_ID, sales('agent-7'), NOW);
    expect(byMobile.customer.id).toBe(PATIENT_ID);
    expect(byMobile.crm?.leadId).toBe('lead-visible');

    // Visibility scope passed to the lead lookup is the agent's own leads.
    const leadArgs = prismaMock.crmLead.findFirst.mock.calls[0][0];
    expect(leadArgs.where.AND[0]).toEqual({
      OR: [{ assignedToId: 'agent-7' }, { createdById: 'agent-7' }],
    });

    // Email-only match: mobile differs, email matches, lead still visible to the agent.
    store.crmLead.length = 0;
    seedLead({ id: 'lead-email', mobile: '+910000000002', email: PATIENT_EMAIL });
    const byEmail = await customerSummary(PATIENT_ID, sales('agent-7'), NOW);
    expect(byEmail.customer.id).toBe(PATIENT_ID);
    expect(byEmail.crm?.leadId).toBe('lead-email');
  });

  it('a read-all actor (CRM_ADMIN) gets the summary with no linked lead, and crm is null', async () => {
    seedPatient();

    const summary = await customerSummary(PATIENT_ID, crmAdmin(), NOW);

    expect(summary.customer.id).toBe(PATIENT_ID);
    expect(summary.crm).toBeNull();
    // No lead means no open-task count is queried.
    expect(prismaMock.crmTask.count).not.toHaveBeenCalled();
  });

  it('a non-PATIENT user id returns NotFoundError, even for a read-all actor', async () => {
    seedPatient();
    seed('user', { id: 'sales-1', name: 'Staff', mobile: '+919822222222', email: null, role: 'SALES' });
    seed('user', { id: 'doctor-1', name: 'Dr X', mobile: '+919833333333', email: null, role: 'DOCTOR' });

    await expect(customerSummary('sales-1', crmAdmin(), NOW)).rejects.toBeInstanceOf(NotFoundError);
    await expect(customerSummary('doctor-1', crmAdmin(), NOW)).rejects.toBeInstanceOf(NotFoundError);
    await expect(customerSummary('missing-id', admin(), NOW)).rejects.toBeInstanceOf(NotFoundError);

    // The user lookup itself is constrained to role PATIENT.
    expect(prismaMock.user.findFirst.mock.calls[0][0].where).toEqual({ id: 'sales-1', role: 'PATIENT' });
  });
});

describe('customerSummary: privacy', () => {
  it('returns no notes, prescription(s), report(s), diagnosis, message(s), body or content keys anywhere in the tree', async () => {
    seedPatient();
    seedLead();
    seedClinicalNoise();

    const summary = await customerSummary(PATIENT_ID, sales('agent-7'), NOW);

    const FORBIDDEN = [
      'notes',
      'prescription',
      'prescriptions',
      'report',
      'reports',
      'diagnosis',
      'message',
      'messages',
      'body',
      'content',
    ];

    const keys: string[] = [];
    const walk = (value: unknown) => {
      if (Array.isArray(value)) value.forEach(walk);
      else if (value && typeof value === 'object' && !(value instanceof Date)) {
        for (const [k, v] of Object.entries(value)) {
          keys.push(k);
          walk(v);
        }
      }
    };
    walk(summary);

    // Guard against a vacuous pass: the walk must actually see the tree.
    expect(keys).toContain('healthcare');
    expect(keys).toContain('support');
    expect(keys.filter((k) => FORBIDDEN.includes(k))).toEqual([]);
    expect(keys).not.toContain('passwordHash');
  });
});

describe('customerSummary: finance and totals', () => {
  it('finance.outstanding is null, not zero', async () => {
    seedPatient();
    seedLead();

    const summary = await customerSummary(PATIENT_ID, sales('agent-7'), NOW);

    expect(summary.finance.outstanding).toBeNull();
    expect(summary.finance.outstanding).not.toBe(0);
  });

  it('upcoming appointments are PENDING_PAYMENT or CONFIRMED with scheduledAt >= now', async () => {
    seedPatient();
    seedLead();
    seed('appointment', { id: 'a1', patientUserId: PATIENT_ID, status: 'PENDING_PAYMENT', scheduledAt: new Date('2026-10-10T09:00:00Z') });
    seed('appointment', { id: 'a2', patientUserId: PATIENT_ID, status: 'CONFIRMED', scheduledAt: new Date('2026-10-12T09:00:00Z') });
    seed('appointment', { id: 'a3', patientUserId: PATIENT_ID, status: 'CONFIRMED', scheduledAt: NOW }); // boundary, included
    seed('appointment', { id: 'a4', patientUserId: PATIENT_ID, status: 'CONFIRMED', scheduledAt: new Date('2026-10-01T09:00:00Z') }); // past
    seed('appointment', { id: 'a5', patientUserId: PATIENT_ID, status: 'COMPLETED', scheduledAt: new Date('2026-10-14T09:00:00Z') });
    seed('appointment', { id: 'a6', patientUserId: PATIENT_ID, status: 'CANCELLED', scheduledAt: new Date('2026-10-15T09:00:00Z') });
    seed('appointment', { id: 'a7', patientUserId: PATIENT_ID, status: 'NO_SHOW', scheduledAt: new Date('2026-10-16T09:00:00Z') });
    seed('appointment', { id: 'a8', patientUserId: 'someone-else', status: 'CONFIRMED', scheduledAt: new Date('2026-10-17T09:00:00Z') });

    const summary = await customerSummary(PATIENT_ID, sales('agent-7'), NOW);

    const upcomingCall = prismaMock.appointment.count.mock.calls
      .map((c: any[]) => c[0].where)
      .find((w: any) => w.status !== undefined);
    expect(upcomingCall).toBeDefined();
    expect(upcomingCall.status).toEqual({ in: ['PENDING_PAYMENT', 'CONFIRMED'] });
    expect(upcomingCall.scheduledAt).toEqual({ gte: NOW });
    expect(upcomingCall.patientUserId).toBe(PATIENT_ID);

    // Rows: a1, a2, a3 (boundary) count. a4 past, a5-a7 wrong status, a8 other patient.
    expect(summary.healthcare.appointments.upcoming).toBe(3);
    expect(summary.healthcare.appointments.total).toBe(7);
  });

  it('refund totals count only refunds with status COMPLETED', async () => {
    seedPatient();
    seedLead();
    const p1 = seed('payment', { id: 'p1', payerUserId: PATIENT_ID, status: 'SUCCESS', amount: 500 });
    const p2 = seed('payment', { id: 'p2', payerUserId: PATIENT_ID, status: 'SUCCESS', amount: 250 });
    const p3 = seed('payment', { id: 'p3', payerUserId: 'someone-else', status: 'SUCCESS', amount: 900 });
    seed('refund', { id: 'r1', payment: p1, status: 'COMPLETED', amount: 100 });
    seed('refund', { id: 'r2', payment: p1, status: 'REQUESTED', amount: 50 });
    seed('refund', { id: 'r3', payment: p2, status: 'PROCESSING', amount: 30 });
    seed('refund', { id: 'r4', payment: p2, status: 'REJECTED', amount: 20 });
    seed('refund', { id: 'r5', payment: p2, status: 'APPROVED', amount: 15 });
    seed('refund', { id: 'r6', payment: p2, status: 'COMPLETED', amount: 40 });
    seed('refund', { id: 'r7', payment: p3, status: 'COMPLETED', amount: 999 });

    const summary = await customerSummary(PATIENT_ID, sales('agent-7'), NOW);

    const refundWhere = prismaMock.refund.aggregate.mock.calls[0][0].where;
    expect(refundWhere.status).toBe('COMPLETED');
    expect(summary.finance.refundCount).toBe(2);
    expect(summary.finance.totalRefunded).toBe(140);
  });

  it('payment totals count only payments with status SUCCESS', async () => {
    seedPatient();
    seedLead();
    seed('payment', { id: 'p1', payerUserId: PATIENT_ID, status: 'SUCCESS', amount: 500 });
    seed('payment', { id: 'p2', payerUserId: PATIENT_ID, status: 'SUCCESS', amount: 250 });
    seed('payment', { id: 'p3', payerUserId: PATIENT_ID, status: 'FAILED', amount: 800 });
    seed('payment', { id: 'p4', payerUserId: PATIENT_ID, status: 'PENDING', amount: 300 });
    seed('payment', { id: 'p5', payerUserId: PATIENT_ID, status: 'CREATED', amount: 100 });
    seed('payment', { id: 'p6', payerUserId: PATIENT_ID, status: 'REFUNDED', amount: 400 });
    seed('payment', { id: 'p7', payerUserId: PATIENT_ID, status: 'PARTIALLY_REFUNDED', amount: 600 });
    seed('payment', { id: 'p8', payerUserId: 'someone-else', status: 'SUCCESS', amount: 900 });

    const summary = await customerSummary(PATIENT_ID, sales('agent-7'), NOW);

    const paymentWhere = prismaMock.payment.aggregate.mock.calls[0][0].where;
    expect(paymentWhere).toEqual({ payerUserId: PATIENT_ID, status: 'SUCCESS' });
    expect(summary.finance.paidCount).toBe(2);
    expect(summary.finance.totalPaid).toBe(750);
  });
});

describe('customerSummary: support and CRM tasks', () => {
  it('support open uses OPEN, IN_PROGRESS, WAITING_CUSTOMER, WAITING_PARTNER; closed uses RESOLVED and CLOSED', async () => {
    seedPatient();
    seedLead();
    seed('supportTicket', { id: 't1', requesterUserId: PATIENT_ID, status: 'OPEN' });
    seed('supportTicket', { id: 't2', requesterUserId: PATIENT_ID, status: 'IN_PROGRESS' });
    seed('supportTicket', { id: 't3', requesterUserId: 'staff-9', linkedPatientUserId: PATIENT_ID, status: 'WAITING_CUSTOMER' });
    seed('supportTicket', { id: 't4', requesterUserId: PATIENT_ID, status: 'WAITING_PARTNER' });
    seed('supportTicket', { id: 't5', requesterUserId: PATIENT_ID, status: 'RESOLVED' });
    seed('supportTicket', { id: 't6', requesterUserId: PATIENT_ID, status: 'CLOSED' });
    seed('supportTicket', { id: 't7', requesterUserId: 'someone-else', status: 'OPEN' });

    const summary = await customerSummary(PATIENT_ID, sales('agent-7'), NOW);

    const statusFilters = prismaMock.supportTicket.count.mock.calls.map((c: any[]) => c[0].where.status);
    expect(statusFilters).toContainEqual({ in: ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_PARTNER'] });
    expect(statusFilters).toContainEqual({ in: ['RESOLVED', 'CLOSED'] });

    expect(summary.support.open).toBe(4);
    expect(summary.support.closed).toBe(2);
  });

  it('crm.openTasks counts only TODO, IN_PROGRESS, BLOCKED tasks for the linked lead', async () => {
    seedPatient();
    seedLead({ id: 'lead-1' });
    seed('crmLead', { id: 'lead-2', mobile: '+910000000003', assignedToId: 'agent-7', createdById: 'agent-7' });
    seed('crmTask', { id: 'k1', leadId: 'lead-1', status: 'TODO' });
    seed('crmTask', { id: 'k2', leadId: 'lead-1', status: 'IN_PROGRESS' });
    seed('crmTask', { id: 'k3', leadId: 'lead-1', status: 'BLOCKED' });
    seed('crmTask', { id: 'k4', leadId: 'lead-1', status: 'COMPLETED' });
    seed('crmTask', { id: 'k5', leadId: 'lead-1', status: 'CANCELLED' });
    seed('crmTask', { id: 'k6', leadId: 'lead-2', status: 'TODO' });
    seed('crmTask', { id: 'k7', leadId: null, status: 'TODO' });

    const summary = await customerSummary(PATIENT_ID, sales('agent-7'), NOW);

    const taskWhere = prismaMock.crmTask.count.mock.calls[0][0].where;
    expect(taskWhere.leadId).toBe('lead-1');
    expect(taskWhere.status).toEqual({ in: ['TODO', 'IN_PROGRESS', 'BLOCKED'] });
    expect(summary.crm?.openTasks).toBe(3);
  });
});
