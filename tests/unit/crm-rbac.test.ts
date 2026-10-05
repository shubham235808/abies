import { describe, expect, it } from 'vitest';
import {
  canAssignLeads,
  canReadAllLeads,
  canWriteLeads,
  leadVisibilityWhere,
  requireCrmAccess,
  type CrmActor,
} from '@abies/domain/modules/crm/rbac';
import { createLeadSchema } from '@abies/domain/modules/crm/leads.schemas';

const actor = (role: CrmActor['role'], userId = 'u1'): CrmActor => ({ userId, role });

describe('CRM access rules', () => {
  it('keeps patients, doctors and other portal roles out of CRM', () => {
    for (const role of ['PATIENT', 'DOCTOR', 'LAB', 'PHARMACY', 'PANCHAKARMA_CENTRE', 'CUSTOMER_SUPPORT', 'TECH_SUPPORT', 'CARE_COORDINATOR'] as const) {
      expect(() => requireCrmAccess(actor(role))).toThrow();
    }
  });

  it('lets sales agents in, but only over their own leads', () => {
    expect(() => requireCrmAccess(actor('SALES'))).not.toThrow();
    expect(canReadAllLeads(actor('SALES'))).toBe(false);
    expect(canWriteLeads(actor('SALES'))).toBe(true);
    expect(canAssignLeads(actor('SALES'))).toBe(false);
    expect(leadVisibilityWhere(actor('SALES', 'agent-7'))).toEqual({
      OR: [{ assignedToId: 'agent-7' }, { createdById: 'agent-7' }],
    });
  });

  it('gives managers and admins every lead and assignment rights', () => {
    for (const role of ['ADMIN', 'CRM_ADMIN', 'SALES_MANAGER'] as const) {
      expect(canReadAllLeads(actor(role))).toBe(true);
      expect(canWriteLeads(actor(role))).toBe(true);
      expect(canAssignLeads(actor(role))).toBe(true);
      expect(leadVisibilityWhere(actor(role))).toEqual({});
    }
  });

  it('lets marketing and auditors read everything but write nothing', () => {
    for (const role of ['MARKETING', 'AUDITOR'] as const) {
      expect(canReadAllLeads(actor(role))).toBe(true);
      expect(canWriteLeads(actor(role))).toBe(false);
      expect(canAssignLeads(actor(role))).toBe(false);
    }
  });
});

describe('lead input validation', () => {
  const base = { firstName: 'Asha', source: 'WEBSITE' as const };

  it('requires a mobile or an email', () => {
    expect(createLeadSchema.safeParse(base).success).toBe(false);
  });

  it('normalises a 10-digit mobile to +91', () => {
    const parsed = createLeadSchema.parse({ ...base, mobile: '98765 43210' });
    expect(parsed.mobile).toBe('+919876543210');
  });

  it('rejects a mobile that is not an Indian mobile number', () => {
    expect(createLeadSchema.safeParse({ ...base, mobile: '12345' }).success).toBe(false);
  });

  it('rejects an unknown lead source', () => {
    expect(createLeadSchema.safeParse({ ...base, mobile: '9876543210', source: 'SOMEWHERE' }).success).toBe(false);
  });

  it('rejects a PIN code that is not six digits', () => {
    expect(createLeadSchema.safeParse({ ...base, mobile: '9876543210', pinCode: '28' }).success).toBe(false);
  });
});
