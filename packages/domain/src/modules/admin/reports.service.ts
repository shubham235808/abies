import { prisma } from '../../lib/db';

export interface DateRange {
  from: Date;
  to: Date;
}

// ENTERPRISE-14 — date-range-filtered reports, distinct from
// dashboard.service.ts's lifetime-snapshot getDashboardMetrics(). Every
// report here answers a real operational question the brief names
// (volume, SLA, revenue, funnel) — no speculative charts, per §75.

export async function revenueReport({ from, to }: DateRange) {
  const payments = await prisma.payment.groupBy({
    by: ['purpose'],
    where: { status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED'] }, createdAt: { gte: from, lte: to } },
    _sum: { amount: true },
    _count: { _all: true },
  });
  return payments
    .map((p) => ({ purpose: p.purpose, count: p._count._all, totalAmount: p._sum.amount ?? 0 }))
    .sort((a, b) => b.totalAmount - a.totalAmount);
}

export async function operationalVolumeReport({ from, to }: DateRange) {
  const [appointments, diagnosticOrders, medicineOrders, panchakarmaBookings] = await Promise.all([
    prisma.appointment.groupBy({ by: ['status'], where: { createdAt: { gte: from, lte: to } }, _count: { _all: true } }),
    prisma.diagnosticOrder.groupBy({ by: ['status'], where: { createdAt: { gte: from, lte: to } }, _count: { _all: true } }),
    prisma.medicineOrder.groupBy({ by: ['status'], where: { createdAt: { gte: from, lte: to } }, _count: { _all: true } }),
    prisma.panchakarmaBooking.groupBy({ by: ['status'], where: { createdAt: { gte: from, lte: to } }, _count: { _all: true } }),
  ]);
  const rows: { service: string; status: string; count: number }[] = [];
  for (const r of appointments) rows.push({ service: 'Appointment', status: r.status, count: r._count._all });
  for (const r of diagnosticOrders) rows.push({ service: 'Diagnostic order', status: r.status, count: r._count._all });
  for (const r of medicineOrders) rows.push({ service: 'Medicine order', status: r.status, count: r._count._all });
  for (const r of panchakarmaBookings) rows.push({ service: 'Panchakarma booking', status: r.status, count: r._count._all });
  return rows;
}

export async function supportSlaReport({ from, to }: DateRange) {
  const tickets = await prisma.supportTicket.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { department: true, priority: true, status: true, createdAt: true, resolvedAt: true, sla: true },
  });

  const byDepartment = new Map<string, { total: number; resolved: number; slaBreached: number; totalResolutionHours: number; resolvedWithTiming: number }>();
  const now = new Date();
  for (const t of tickets) {
    const row = byDepartment.get(t.department) ?? { total: 0, resolved: 0, slaBreached: 0, totalResolutionHours: 0, resolvedWithTiming: 0 };
    row.total += 1;
    const responseDueAt = (t.sla as { responseDueAt?: string } | null)?.responseDueAt;
    const stillOpen = t.status !== 'RESOLVED' && t.status !== 'CLOSED';
    if (responseDueAt && new Date(responseDueAt) < now && stillOpen) row.slaBreached += 1;
    if (t.resolvedAt) {
      row.resolved += 1;
      row.totalResolutionHours += (t.resolvedAt.getTime() - t.createdAt.getTime()) / (1000 * 60 * 60);
      row.resolvedWithTiming += 1;
    }
    byDepartment.set(t.department, row);
  }

  return [...byDepartment.entries()]
    .map(([department, r]) => ({
      department,
      total: r.total,
      resolved: r.resolved,
      slaBreached: r.slaBreached,
      avgResolutionHours: r.resolvedWithTiming > 0 ? Math.round((r.totalResolutionHours / r.resolvedWithTiming) * 10) / 10 : null,
    }))
    .sort((a, b) => b.total - a.total);
}

export async function partnerFunnelReport({ from, to }: DateRange) {
  const leads = await prisma.partnerLead.findMany({
    where: { createdAt: { gte: from, lte: to } },
    select: { stage: true, createdAt: true, updatedAt: true },
  });
  const byStage = new Map<string, number>();
  for (const l of leads) byStage.set(l.stage, (byStage.get(l.stage) ?? 0) + 1);

  const activated = leads.filter((l) => l.stage === 'ACTIVATED');
  // No per-stage-transition history is modelled (PartnerLead only has
  // createdAt/updatedAt) — updatedAt on a lead currently sitting in
  // ACTIVATED is a reasonable proxy for "when it got there," not an exact
  // measurement, and is labelled as such rather than presented as precise.
  const avgDaysToActivate =
    activated.length > 0
      ? Math.round((activated.reduce((sum, l) => sum + (l.updatedAt.getTime() - l.createdAt.getTime()), 0) / activated.length / (1000 * 60 * 60 * 24)) * 10) / 10
      : null;

  return {
    total: leads.length,
    activated: activated.length,
    rejected: leads.filter((l) => l.stage === 'REJECTED').length,
    conversionRatePercent: leads.length > 0 ? Math.round((activated.length / leads.length) * 1000) / 10 : 0,
    avgDaysToActivate,
    byStage: [...byStage.entries()].map(([stage, count]) => ({ stage, count })),
  };
}

export function toCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]!);
  const escape = (v: unknown) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [headers.join(','), ...rows.map((r) => headers.map((h) => escape(r[h])).join(','))].join('\n');
}
