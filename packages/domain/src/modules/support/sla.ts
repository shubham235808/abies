import type { SupportTicketCategory, SupportTicketPriority } from '@prisma/client';

// Brief's exact Support SLA Model (blueprint §27). Response targets are
// concrete durations; resolution targets for P2-P4 are qualitative
// ("same business day", "1-2 business days") in the source table, not a
// fixed duration, so they're kept as descriptive text rather than a second
// computed deadline — no business-hours/holiday calendar is modelled here,
// deadlines are plain wall-clock offsets from creation.
const SLA_TABLE: Record<SupportTicketPriority, { responseTargetMinutes: number; resolutionTarget: string }> = {
  P1: { responseTargetMinutes: 15, resolutionTarget: 'Hourly update until controlled; RCA after closure' },
  P2: { responseTargetMinutes: 60, resolutionTarget: 'Same business day or clear workaround' },
  P3: { responseTargetMinutes: 4 * 60, resolutionTarget: '1-2 business days' },
  P4: { responseTargetMinutes: 24 * 60, resolutionTarget: 'Tracked through backlog/knowledge base' },
};

// Patient support journey classification (blueprint §28) mapped to a
// default priority — an honest simplification of "priority and routing
// rules trigger SLA timer": no scale/impact-aware classifier, just a
// per-category default that an agent can override once they have context
// a patient's own ticket form can't capture (see tickets.service.ts triage).
const DEFAULT_PRIORITY: Record<SupportTicketCategory, SupportTicketPriority> = {
  CLINICAL_CONCERN: 'P1',
  TECHNICAL_ISSUE: 'P2',
  PAYMENT: 'P2',
  BOOKING: 'P3',
  REPORT: 'P3',
  MEDICINE: 'P3',
  THERAPY: 'P3',
  GENERAL: 'P4',
};

const DEFAULT_DEPARTMENT: Record<SupportTicketCategory, 'CUSTOMER_SUPPORT' | 'TECH_SUPPORT' | 'CARE_COORDINATION'> = {
  CLINICAL_CONCERN: 'CARE_COORDINATION',
  TECHNICAL_ISSUE: 'TECH_SUPPORT',
  PAYMENT: 'CUSTOMER_SUPPORT',
  BOOKING: 'CUSTOMER_SUPPORT',
  REPORT: 'CUSTOMER_SUPPORT',
  MEDICINE: 'CUSTOMER_SUPPORT',
  THERAPY: 'CUSTOMER_SUPPORT',
  GENERAL: 'CUSTOMER_SUPPORT',
};

export function defaultPriorityFor(category: SupportTicketCategory): SupportTicketPriority {
  return DEFAULT_PRIORITY[category];
}

export function defaultDepartmentFor(category: SupportTicketCategory) {
  return DEFAULT_DEPARTMENT[category];
}

export function buildSlaSnapshot(priority: SupportTicketPriority, createdAt: Date) {
  const target = SLA_TABLE[priority];
  return {
    priority,
    responseTargetMinutes: target.responseTargetMinutes,
    responseDueAt: new Date(createdAt.getTime() + target.responseTargetMinutes * 60_000).toISOString(),
    resolutionTarget: target.resolutionTarget,
  };
}
