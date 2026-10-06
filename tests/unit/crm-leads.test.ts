import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  assignLead,
  changeStage,
  createLead,
  listLeads,
  updateLead,
} from '@abies/domain/modules/crm/leads.service';
import { createLeadSchema } from '@abies/domain/modules/crm/leads.schemas';
import type { CrmActor } from '@abies/domain/modules/crm/rbac';
import { BadRequestError, ConflictError, ForbiddenError } from '../../packages/domain/src/lib/errors';

const { prismaMock, recordAuditEventMock } = vi.hoisted(() => ({
  prismaMock: {
    crmLead: {
      findFirst: vi.fn(),
      findMany: vi.fn(),
      count: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
    },
    crmTag: { upsert: vi.fn() },
    crmActivity: { create: vi.fn() },
    user: { findUnique: vi.fn() },
  },
  recordAuditEventMock: vi.fn(),
}));

vi.mock('../../packages/domain/src/lib/db', () => ({ prisma: prismaMock }));
vi.mock('../../packages/domain/src/server/audit', () => ({ recordAuditEvent: recordAuditEventMock }));

const CLOSED = ['LOST', 'INVALID', 'DUPLICATE'];

type Lead = Record<string, unknown> & { id: string; stage: string };

// In-memory lead store. findFirst honours the subset of the Prisma `where`
// shape the service uses (id, OR of equalities, stage.notIn) so the duplicate
// rules are exercised against real data rather than a canned return value.
let leads: Lead[] = [];

function matches(lead: Lead, where: Record<string, any>): boolean {
  if (where.id !== undefined && lead.id !== where.id) return false;
  if (Array.isArray(where.OR) && !where.OR.some((c: Record<string, unknown>) =>
    Object.entries(c).every(([k, v]) => lead[k] === v),
  )) return false;
  if (where.stage?.notIn && where.stage.notIn.includes(lead.stage)) return false;
  return true;
}

const admin = (): CrmActor => ({ userId: 'admin-1', role: 'ADMIN', mfaVerified: true, sessionId: 's-admin' });
const sales = (userId = 'agent-7'): CrmActor => ({ userId, role: 'SALES', sessionId: 's-sales' });
const marketing = (): CrmActor => ({ userId: 'mkt-1', role: 'MARKETING', sessionId: 's-mkt' });
const auditor = (): CrmActor => ({ userId: 'aud-1', role: 'AUDITOR', sessionId: 's-aud' });

const newLead = (overrides: Partial<Lead> = {}): Lead => ({
  id: 'lead-1',
  firstName: 'Asha',
  lastName: null,
  mobile: '+919876543210',
  email: null,
  city: 'Pune',
  state: null,
  stage: 'NEW',
  priority: 'MEDIUM',
  assignedToId: null,
  createdById: 'admin-1',
  ...overrides,
});

const baseCreate = {
  firstName: 'Asha',
  mobile: '+919876543210',
  source: 'WEBSITE' as const,
  priority: 'MEDIUM' as const,
};

beforeEach(() => {
  vi.clearAllMocks();
  leads = [];
  prismaMock.crmLead.findFirst.mockImplementation(({ where }) => leads.find((l) => matches(l, where)) ?? null);
  prismaMock.crmLead.update.mockImplementation(({ where, data }) => {
    const existing = leads.find((l) => l.id === where.id) ?? ({ id: where.id } as Lead);
    return { ...existing, ...data };
  });
  prismaMock.crmLead.create.mockImplementation(({ data }) => ({ id: 'lead-new', ...data }));
  prismaMock.crmLead.findMany.mockResolvedValue([]);
  prismaMock.crmLead.count.mockResolvedValue(0);
  prismaMock.user.findUnique.mockResolvedValue(null);
});

describe('CRM lead rules', () => {
  it('admin without MFA cannot read leads, and admin with MFA can', async () => {
    const noMfa: CrmActor = { userId: 'admin-1', role: 'ADMIN', mfaVerified: false };
    await expect(listLeads({ page: 1, pageSize: 25 }, noMfa)).rejects.toBeInstanceOf(ForbiddenError);
    expect(prismaMock.crmLead.findMany).not.toHaveBeenCalled();

    await expect(listLeads({ page: 1, pageSize: 25 }, admin())).resolves.toMatchObject({ total: 0 });
    expect(prismaMock.crmLead.findMany).toHaveBeenCalledTimes(1);
  });

  it('SALES agent list query is scoped to assignedToId or createdById equal to their userId', async () => {
    await listLeads({ page: 1, pageSize: 25 }, sales('agent-7'));

    const args = prismaMock.crmLead.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      OR: [{ assignedToId: 'agent-7' }, { createdById: 'agent-7' }],
    });
    expect(prismaMock.crmLead.count).toHaveBeenCalledWith({ where: args.where });
  });

  it('SALES agent cannot assign a lead to another user', async () => {
    leads = [newLead({ assignedToId: 'agent-7', createdById: 'agent-7' })];

    await expect(assignLead('lead-1', 'agent-8', undefined, sales('agent-7'))).rejects.toBeInstanceOf(ForbiddenError);
    expect(prismaMock.crmLead.update).not.toHaveBeenCalled();
    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });

  it('SALES agent cannot create a lead assigned to another user', async () => {
    await expect(
      createLead({ ...baseCreate, assignedToId: 'agent-8' }, sales('agent-7')),
    ).rejects.toBeInstanceOf(ForbiddenError);
    expect(prismaMock.crmLead.create).not.toHaveBeenCalled();
  });

  it.each(['MARKETING', 'AUDITOR'] as const)(
    'assigning a lead to a %s user is rejected with BadRequestError',
    async (role) => {
      leads = [newLead()];
      prismaMock.user.findUnique.mockResolvedValue({ id: 'u-x', status: 'ACTIVE', role });

      await expect(assignLead('lead-1', 'u-x', undefined, admin())).rejects.toBeInstanceOf(BadRequestError);
      expect(prismaMock.crmLead.update).not.toHaveBeenCalled();
    },
  );

  it.each([
    ['MARKETING', marketing],
    ['AUDITOR', auditor],
  ] as const)('%s cannot change stage (ForbiddenError from writableLead)', async (_label, actorFactory) => {
    leads = [newLead()];

    await expect(changeStage('lead-1', 'CONTACTED', undefined, actorFactory())).rejects.toBeInstanceOf(ForbiddenError);
    expect(prismaMock.crmLead.update).not.toHaveBeenCalled();
    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });

  it('creating a lead whose mobile matches an open lead throws ConflictError with the specific message for a read-all actor', async () => {
    leads = [newLead({ id: 'lead-9', stage: 'CONTACTED' })];

    await expect(createLead({ ...baseCreate }, admin())).rejects.toThrow(
      new ConflictError('A lead with this mobile or email already exists'),
    );
    expect(prismaMock.crmLead.create).not.toHaveBeenCalled();
  });

  it('creating a lead whose mobile matches an open lead throws ConflictError with the generic message for a SALES actor', async () => {
    leads = [newLead({ id: 'lead-9', stage: 'NEW', createdById: 'agent-8' })];

    const err = await createLead({ ...baseCreate }, sales('agent-7')).catch((e) => e);
    expect(err).toBeInstanceOf(ConflictError);
    expect(err.message).toBe('This contact may already be on file. Ask your manager before adding it.');
    expect(prismaMock.crmLead.create).not.toHaveBeenCalled();
  });

  it('the duplicate check excludes closed stages from the match', async () => {
    await createLead({ ...baseCreate }, admin());
    const where = prismaMock.crmLead.findFirst.mock.calls[0][0].where;
    expect(where.stage).toEqual({ notIn: CLOSED });
  });

  it.each(CLOSED)('creating a lead whose mobile matches only a %s lead is allowed', async (stage) => {
    leads = [newLead({ id: 'lead-old', stage })];

    await expect(createLead({ ...baseCreate }, admin())).resolves.toMatchObject({ id: 'lead-new' });
    expect(prismaMock.crmLead.create).toHaveBeenCalledTimes(1);
  });

  it('changing stage to LOST without a reason is rejected with BadRequestError', async () => {
    leads = [newLead({ stage: 'QUALIFIED' })];

    await expect(changeStage('lead-1', 'LOST', undefined, admin())).rejects.toBeInstanceOf(BadRequestError);
    expect(prismaMock.crmLead.update).not.toHaveBeenCalled();
  });

  it('changing stage to the same stage returns the lead unchanged and writes no audit event', async () => {
    leads = [newLead({ stage: 'NEW' })];

    const result = await changeStage('lead-1', 'NEW', undefined, admin());
    expect(result).toMatchObject({ id: 'lead-1', stage: 'NEW' });
    expect(prismaMock.crmLead.update).not.toHaveBeenCalled();
    expect(recordAuditEventMock).not.toHaveBeenCalled();
  });

  it('a stage change writes exactly one STAGE_CHANGED audit event with from and to metadata', async () => {
    leads = [newLead({ stage: 'NEW' })];

    await changeStage('lead-1', 'CONTACTED', undefined, admin());

    expect(recordAuditEventMock).toHaveBeenCalledTimes(1);
    expect(recordAuditEventMock).toHaveBeenCalledWith(
      expect.objectContaining({ userId: 'admin-1', sessionId: 's-admin' }),
      expect.objectContaining({
        eventType: 'CRM_LEAD',
        action: 'STAGE_CHANGED',
        resourceType: 'CrmLead',
        resourceId: 'lead-1',
        metadata: expect.objectContaining({ from: 'NEW', to: 'CONTACTED' }),
      }),
    );
  });

  it('updateLead records before and after values for the changed keys only', async () => {
    leads = [newLead({ city: 'Pune', priority: 'LOW', firstName: 'Asha' })];

    await updateLead('lead-1', { city: 'Mumbai', priority: 'HIGH' }, admin());

    expect(recordAuditEventMock).toHaveBeenCalledTimes(1);
    const [, entry] = recordAuditEventMock.mock.calls[0];
    expect(entry).toMatchObject({ action: 'UPDATED', resourceId: 'lead-1' });
    expect(entry.metadata.changes).toEqual({
      city: { before: 'Pune', after: 'Mumbai' },
      priority: { before: 'LOW', after: 'HIGH' },
    });
    expect(Object.keys(entry.metadata.changes)).not.toContain('firstName');
  });
});

describe('createLeadSchema', () => {
  const base = { firstName: 'Asha', source: 'WEBSITE' as const };

  it('normalises the Indian mobile "98765 43210" to "+919876543210"', () => {
    const parsed = createLeadSchema.parse({ ...base, mobile: '98765 43210' });
    expect(parsed.mobile).toBe('+919876543210');
  });

  it('rejects a mobile of "12345"', () => {
    const result = createLeadSchema.safeParse({ ...base, mobile: '12345' });
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues.some((i) => i.path.includes('mobile'))).toBe(true);
  });

  it.each(['12345', '1234567', 'abcdef', '12 345'])('rejects a PIN code of "%s"', (pinCode) => {
    const result = createLeadSchema.safeParse({ ...base, email: 'a@example.com', pinCode });
    expect(result.success).toBe(false);
    expect(result.success === false && result.error.issues.some((i) => i.path.includes('pinCode'))).toBe(true);
  });

  it('accepts a six-digit PIN code', () => {
    expect(createLeadSchema.safeParse({ ...base, mobile: '9876543210', pinCode: '560001' }).success).toBe(true);
  });

  it('requires a mobile or an email', () => {
    expect(createLeadSchema.safeParse(base).success).toBe(false);
    expect(createLeadSchema.safeParse({ ...base, email: 'asha@example.com' }).success).toBe(true);
    expect(createLeadSchema.safeParse({ ...base, mobile: '9876543210' }).success).toBe(true);
  });
});
