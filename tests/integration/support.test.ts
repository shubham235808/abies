// @vitest-environment node
import { randomInt } from 'crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { prisma } from '@/lib/db';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@/lib/errors';
import {
  addMessage,
  browserContextFromUserAgent,
  claimTicket,
  createTicket,
  getTicket,
  technicalIncidentBreakdown,
  triageTicket,
  updateStatus,
} from '@/modules/support/tickets.service';
import { createStaffAccount } from '@/modules/staff/staff.service';
import { claimLead, createLead, updateLead } from '@/modules/partners/leads.service';

// 10 digits, starting 6-9 — matches auth.service.ts's normalizeMobile so the
// same value works both as a raw prisma-create mobile (below) and as
// createStaffAccount's `mobile` input (which normalizes and re-checks it).
function freshMobile(): string {
  return `9${randomInt(100000000, 999999999)}`;
}

const createdUserIds: string[] = [];

async function createUser(role: 'PATIENT' | 'ADMIN' | 'CUSTOMER_SUPPORT' | 'TECH_SUPPORT' | 'SALES' | 'CARE_COORDINATOR') {
  const user = await prisma.user.create({ data: { mobile: `+91${freshMobile()}`, role } });
  createdUserIds.push(user.id);
  return user.id;
}

afterAll(async () => {
  if (createdUserIds.length) {
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
  }
  // PartnerLead.ownerUserId is onDelete: SetNull, not Cascade (a lead
  // outlives the rep who logged it), so deleting the users above doesn't
  // clean these up — same orphaned-row pattern as Phase 8's Medicine table.
  await prisma.partnerLead.deleteMany({ where: { contactName: { in: ['Test Lab', 'Test Centre'] } } });
  await prisma.$disconnect();
});

describe('creating a ticket', () => {
  it('defaults a booking ticket to Customer Support / P3', async () => {
    const patientId = await createUser('PATIENT');
    const ticket = await createTicket(
      patientId,
      'PATIENT',
      { category: 'BOOKING', subject: 'Cannot reschedule', description: 'The reschedule button does nothing at all.' },
      { userId: patientId },
    );
    expect(ticket.department).toBe('CUSTOMER_SUPPORT');
    expect(ticket.priority).toBe('P3');
    expect(ticket.status).toBe('OPEN');
    expect(ticket.linkedPatientUserId).toBe(patientId);
    expect((ticket.sla as { responseTargetMinutes: number }).responseTargetMinutes).toBe(240);
  });

  it('forces clinical concerns to P1 / Care Coordination regardless of who files it', async () => {
    const patientId = await createUser('PATIENT');
    const ticket = await createTicket(
      patientId,
      'PATIENT',
      { category: 'CLINICAL_CONCERN', subject: 'Worrying symptom', description: 'Patient reports a red-flag symptom after a therapy session.' },
      { userId: patientId },
    );
    expect(ticket.priority).toBe('P1');
    expect(ticket.department).toBe('CARE_COORDINATION');
  });

  it('resolves a staff-logged ticket to the named patient by mobile', async () => {
    const agentId = await createUser('CUSTOMER_SUPPORT');
    const patientId = await createUser('PATIENT');
    const patient = await prisma.user.findUniqueOrThrow({ where: { id: patientId } });

    const ticket = await createTicket(
      agentId,
      'CUSTOMER_SUPPORT',
      { category: 'PAYMENT', subject: 'Called in about a refund', description: 'Patient called asking where their refund is.', linkedPatientMobile: patient.mobile },
      { userId: agentId },
    );
    expect(ticket.requesterUserId).toBe(agentId);
    expect(ticket.linkedPatientUserId).toBe(patientId);
    expect(ticket.channel).toBe('WEB_FORM');
  });
});

describe('claiming and triage', () => {
  it('refuses an agent from a different department claiming a ticket', async () => {
    const patientId = await createUser('PATIENT');
    const ticket = await createTicket(patientId, 'PATIENT', { category: 'BOOKING', subject: 'x', description: 'y'.repeat(10) }, { userId: patientId });
    const techAgentId = await createUser('TECH_SUPPORT');

    await expect(claimTicket(ticket.id, techAgentId, 'TECH_SUPPORT', { userId: techAgentId })).rejects.toThrow(ForbiddenError);
  });

  it('lets the matching department claim, and refuses a second agent claiming the same ticket', async () => {
    const patientId = await createUser('PATIENT');
    const ticket = await createTicket(patientId, 'PATIENT', { category: 'BOOKING', subject: 'x', description: 'y'.repeat(10) }, { userId: patientId });
    const agent1 = await createUser('CUSTOMER_SUPPORT');
    const agent2 = await createUser('CUSTOMER_SUPPORT');

    const claimed = await claimTicket(ticket.id, agent1, 'CUSTOMER_SUPPORT', { userId: agent1 });
    expect(claimed.assignedAgentUserId).toBe(agent1);
    expect(claimed.status).toBe('IN_PROGRESS');

    await expect(claimTicket(ticket.id, agent2, 'CUSTOMER_SUPPORT', { userId: agent2 })).rejects.toThrow(ConflictError);
  });

  it('lets ADMIN triage a ticket into a different department', async () => {
    const patientId = await createUser('PATIENT');
    const ticket = await createTicket(patientId, 'PATIENT', { category: 'GENERAL', subject: 'x', description: 'y'.repeat(10) }, { userId: patientId });
    const adminId = await createUser('ADMIN');

    const triaged = await triageTicket(ticket.id, 'ADMIN', { department: 'TECH_SUPPORT', priority: 'P2' }, { userId: adminId });
    expect(triaged.department).toBe('TECH_SUPPORT');
    expect(triaged.priority).toBe('P2');
    expect((triaged.sla as { priority: string }).priority).toBe('P2');
  });
});

describe('status transitions', () => {
  it('refuses jumping straight from OPEN to RESOLVED', async () => {
    const patientId = await createUser('PATIENT');
    const ticket = await createTicket(patientId, 'PATIENT', { category: 'BOOKING', subject: 'x', description: 'y'.repeat(10) }, { userId: patientId });
    const agentId = await createUser('CUSTOMER_SUPPORT');

    await expect(updateStatus(ticket.id, agentId, 'CUSTOMER_SUPPORT', { status: 'RESOLVED' }, { userId: agentId })).rejects.toThrow(BadRequestError);
  });

  it('refuses a patient from changing ticket status themselves', async () => {
    const patientId = await createUser('PATIENT');
    const ticket = await createTicket(patientId, 'PATIENT', { category: 'BOOKING', subject: 'x', description: 'y'.repeat(10) }, { userId: patientId });

    await expect(updateStatus(ticket.id, patientId, 'PATIENT', { status: 'IN_PROGRESS' }, { userId: patientId })).rejects.toThrow(ForbiddenError);
  });

  it('reopens a resolved ticket to IN_PROGRESS when the customer replies again', async () => {
    const patientId = await createUser('PATIENT');
    const ticket = await createTicket(patientId, 'PATIENT', { category: 'BOOKING', subject: 'x', description: 'y'.repeat(10) }, { userId: patientId });
    const agentId = await createUser('CUSTOMER_SUPPORT');

    await claimTicket(ticket.id, agentId, 'CUSTOMER_SUPPORT', { userId: agentId });
    const resolved = await updateStatus(ticket.id, agentId, 'CUSTOMER_SUPPORT', { status: 'RESOLVED' }, { userId: agentId });
    expect(resolved.resolvedAt).not.toBeNull();

    await addMessage(ticket.id, patientId, 'PATIENT', 'Actually this is still broken', { userId: patientId });
    const reopened = await getTicket(ticket.id, agentId, 'CUSTOMER_SUPPORT');
    expect(reopened.status).toBe('IN_PROGRESS');
  });

  it('refuses replying to a closed ticket', async () => {
    const patientId = await createUser('PATIENT');
    const ticket = await createTicket(patientId, 'PATIENT', { category: 'BOOKING', subject: 'x', description: 'y'.repeat(10) }, { userId: patientId });
    const agentId = await createUser('CUSTOMER_SUPPORT');
    await claimTicket(ticket.id, agentId, 'CUSTOMER_SUPPORT', { userId: agentId });
    await updateStatus(ticket.id, agentId, 'CUSTOMER_SUPPORT', { status: 'RESOLVED' }, { userId: agentId });
    await updateStatus(ticket.id, agentId, 'CUSTOMER_SUPPORT', { status: 'CLOSED' }, { userId: agentId });

    await expect(addMessage(ticket.id, patientId, 'PATIENT', 'Hello?', { userId: patientId })).rejects.toThrow(ConflictError);
  });
});

describe('ticket visibility', () => {
  it("hides one patient's ticket from another patient", async () => {
    const patientId = await createUser('PATIENT');
    const strangerId = await createUser('PATIENT');
    const ticket = await createTicket(patientId, 'PATIENT', { category: 'BOOKING', subject: 'x', description: 'y'.repeat(10) }, { userId: patientId });

    await expect(getTicket(ticket.id, strangerId, 'PATIENT')).rejects.toThrow(NotFoundError);
  });

  it('hides a ticket from a staff role in a different department', async () => {
    const patientId = await createUser('PATIENT');
    const ticket = await createTicket(
      patientId,
      'PATIENT',
      { category: 'CLINICAL_CONCERN', subject: 'x', description: 'y'.repeat(10) },
      { userId: patientId },
    );
    const salesId = await createUser('SALES');
    await expect(getTicket(ticket.id, salesId, 'SALES')).rejects.toThrow(NotFoundError);
  });
});

describe('staff provisioning', () => {
  it('creates a User + StaffProfile with the department derived from role', async () => {
    const adminId = await createUser('ADMIN');
    const user = await createStaffAccount({ mobile: freshMobile(), role: 'CARE_COORDINATOR' }, { userId: adminId });
    createdUserIds.push(user.id);
    expect(user.role).toBe('CARE_COORDINATOR');
    expect(user.staffProfile?.department).toBe('CARE_COORDINATION');
    expect(user.staffProfile?.active).toBe(true);
  });

  it('refuses provisioning a mobile number that already has an account', async () => {
    const adminId = await createUser('ADMIN');
    const existing = await prisma.user.findUniqueOrThrow({ where: { id: adminId } });
    await expect(
      createStaffAccount({ mobile: existing.mobile.replace(/^\+91/, ''), role: 'SALES' }, { userId: adminId }),
    ).rejects.toThrow(ConflictError);
  });
});

describe('partner leads', () => {
  it('leaves an admin-logged lead unowned, then lets a sales rep claim it (refusing a second claimant)', async () => {
    const adminId = await createUser('ADMIN');
    const sales1 = await createUser('SALES');
    const lead = await createLead(adminId, 'ADMIN', { kind: 'LAB', contactName: 'Test Lab', contactPhone: '9800000000' }, { userId: adminId });
    expect(lead.ownerUserId).toBeNull();

    const claimed = await claimLead(lead.id, sales1, { userId: sales1 });
    expect(claimed.ownerUserId).toBe(sales1);

    const sales2 = await createUser('SALES');
    await expect(claimLead(lead.id, sales2, { userId: sales2 })).rejects.toThrow(ConflictError);
  });

  it('moves a lead through the pipeline stages', async () => {
    const salesId = await createUser('SALES');
    const lead = await createLead(salesId, 'SALES', { kind: 'PANCHAKARMA_CENTRE', contactName: 'Test Centre', contactPhone: '9800000001' }, { userId: salesId });
    expect(lead.stage).toBe('NEW');

    const updated = await updateLead(lead.id, { stage: 'QUALIFIED' }, { userId: salesId });
    expect(updated.stage).toBe('QUALIFIED');
  });
});

describe('technical incident detail (ENTERPRISE-10)', () => {
  it('records incident detail only for TECHNICAL_ISSUE tickets, routed to Tech Support / P2', async () => {
    const patientId = await createUser('PATIENT');
    const ticket = await createTicket(
      patientId,
      'PATIENT',
      {
        category: 'TECHNICAL_ISSUE',
        subject: 'Booking page is blank',
        description: 'The doctor search page shows nothing after I select a specialty.',
        technicalModule: 'APPOINTMENTS',
        errorClassification: 'PAGE_WONT_LOAD',
        correlationRequestId: 'req-test-12345',
      },
      { userId: patientId, userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/128.0 Safari/537.36' },
    );
    expect(ticket.department).toBe('TECH_SUPPORT');
    expect(ticket.priority).toBe('P2');

    const detail = await prisma.technicalIncidentDetail.findUnique({ where: { ticketId: ticket.id } });
    expect(detail?.technicalModule).toBe('APPOINTMENTS');
    expect(detail?.errorClassification).toBe('PAGE_WONT_LOAD');
    expect(detail?.correlationRequestId).toBe('req-test-12345');
    expect(detail?.browserContext).toBe('Chrome on macOS');
  });

  it('does not create an incident-detail row for a non-technical ticket', async () => {
    const patientId = await createUser('PATIENT');
    const ticket = await createTicket(
      patientId,
      'PATIENT',
      { category: 'BOOKING', subject: 'Reschedule question', description: 'Can I move my appointment to next week?' },
      { userId: patientId },
    );
    const detail = await prisma.technicalIncidentDetail.findUnique({ where: { ticketId: ticket.id } });
    expect(detail).toBeNull();
  });

  it('surfaces incident detail on getTicket and counts it in the module/type breakdown', async () => {
    const patientId = await createUser('PATIENT');
    const ticket = await createTicket(
      patientId,
      'PATIENT',
      {
        category: 'TECHNICAL_ISSUE',
        subject: 'Payment failed silently',
        description: 'I tried to pay for a consultation and nothing happened, no error shown.',
        technicalModule: 'PAYMENTS',
        errorClassification: 'ACTION_FAILED',
      },
      { userId: patientId },
    );

    const fetched = await getTicket(ticket.id, patientId, 'PATIENT');
    expect(fetched.technicalIncidentDetail?.technicalModule).toBe('PAYMENTS');

    const breakdown = await technicalIncidentBreakdown();
    const paymentsRow = breakdown.byModule.find(([key]) => key === 'PAYMENTS');
    expect(paymentsRow?.[1]).toBeGreaterThanOrEqual(1);
    const actionFailedRow = breakdown.byClassification.find(([key]) => key === 'ACTION_FAILED');
    expect(actionFailedRow?.[1]).toBeGreaterThanOrEqual(1);
  });
});

describe('browserContextFromUserAgent (ENTERPRISE-10)', () => {
  it('extracts only a coarse browser/OS pair, never the raw string', () => {
    expect(browserContextFromUserAgent('Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Safari/604.1')).toBe(
      'Safari on iOS',
    );
    expect(browserContextFromUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120.0 Safari/537.36')).toBe(
      'Chrome on Windows',
    );
    expect(browserContextFromUserAgent(undefined)).toBeUndefined();
  });
});
