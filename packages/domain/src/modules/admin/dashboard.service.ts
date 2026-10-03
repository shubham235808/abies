import { PaymentStatus } from '@prisma/client';
import { prisma } from '../../lib/db';

function toCountMap<K extends string, R extends Record<K, string> & { _count: { _all: number } }>(
  rows: R[],
  key: K,
): Record<string, number> {
  return Object.fromEntries(rows.map((r) => [r[key], r._count._all]));
}

const REVENUE_STATUSES: PaymentStatus[] = [PaymentStatus.SUCCESS, PaymentStatus.PARTIALLY_REFUNDED];
const TREND_DAYS = 30;

// EXPANSION-1d — Management Command Centre's revenue trend + breakdown
// charts (docs/EXPANSION-1-VISUAL-GAP-ANALYSIS.md #14): real aggregates
// over the same Payment rows totalRevenue already sums, not a new metrics
// warehouse. Daily bucketing needs date_trunc, which Prisma's query
// builder can't express, so this one query is raw SQL — read-only,
// parameterized (day count is a literal from a module constant, never
// user input), consistent with this app's existing sparing raw-SQL use
// elsewhere for the same reason.
async function revenueTrend(): Promise<{ date: string; amount: number }[]> {
  const rows = await prisma.$queryRaw<{ day: Date; amount: bigint | null }[]>`
    SELECT date_trunc('day', "createdAt") AS day, SUM("amount")::bigint AS amount
    FROM "Payment"
    WHERE status = ANY(${REVENUE_STATUSES}::"PaymentStatus"[])
      AND "createdAt" >= now() - (${TREND_DAYS}::text || ' days')::interval
    GROUP BY day
    ORDER BY day ASC
  `;
  const byDay = new Map(rows.map((r) => [r.day.toISOString().slice(0, 10), Number(r.amount ?? 0)]));

  // Zero-fill every day in the window, not just days with revenue — a
  // trend line with gaps on quiet days would misrepresent the shape of
  // the trend, not just omit a label.
  const days: { date: string; amount: number }[] = [];
  for (let i = TREND_DAYS - 1; i >= 0; i--) {
    const d = new Date();
    d.setUTCDate(d.getUTCDate() - i);
    const key = d.toISOString().slice(0, 10);
    days.push({ date: key, amount: byDay.get(key) ?? 0 });
  }
  return days;
}

// One dashboard, reporting on data every earlier phase already writes —
// Phase 11 adds no new operational entities beyond Refund; "reporting" here
// means making existing counts visible, not inventing a metrics warehouse.
export async function getDashboardMetrics() {
  const [
    pendingDoctors,
    pendingLabs,
    pendingPharmacies,
    pendingCentres,
    appointmentsByStatus,
    diagnosticOrdersByStatus,
    medicineOrdersByStatus,
    panchakarmaBookingsByStatus,
    paymentsByStatus,
    paymentRevenue,
    revenueByPurpose,
    trend,
    refundsByStatus,
    openTicketsByDepartment,
    leadsByStage,
  ] = await Promise.all([
    prisma.doctorProfile.count({ where: { verificationStatus: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
    prisma.diagnosticLab.count({ where: { verificationStatus: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
    prisma.pharmacy.count({ where: { verificationStatus: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
    prisma.panchakarmaCentre.count({ where: { verificationStatus: { in: ['SUBMITTED', 'UNDER_REVIEW'] } } }),
    prisma.appointment.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.diagnosticOrder.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.medicineOrder.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.panchakarmaBooking.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.payment.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.payment.aggregate({ where: { status: { in: REVENUE_STATUSES } }, _sum: { amount: true } }),
    prisma.payment.groupBy({ by: ['purpose'], where: { status: { in: REVENUE_STATUSES } }, _sum: { amount: true } }),
    revenueTrend(),
    prisma.refund.groupBy({ by: ['status'], _count: { _all: true } }),
    prisma.supportTicket.groupBy({ by: ['department', 'status'], _count: { _all: true } }),
    prisma.partnerLead.groupBy({ by: ['stage'], _count: { _all: true } }),
  ]);

  const openTicketsPerDepartment: Record<string, number> = {};
  for (const row of openTicketsByDepartment) {
    if (row.status === 'RESOLVED' || row.status === 'CLOSED') continue;
    openTicketsPerDepartment[row.department] = (openTicketsPerDepartment[row.department] ?? 0) + row._count._all;
  }

  return {
    verificationQueues: {
      doctors: pendingDoctors,
      labs: pendingLabs,
      pharmacies: pendingPharmacies,
      panchakarmaCentres: pendingCentres,
    },
    appointmentsByStatus: toCountMap(appointmentsByStatus, 'status'),
    diagnosticOrdersByStatus: toCountMap(diagnosticOrdersByStatus, 'status'),
    medicineOrdersByStatus: toCountMap(medicineOrdersByStatus, 'status'),
    panchakarmaBookingsByStatus: toCountMap(panchakarmaBookingsByStatus, 'status'),
    paymentsByStatus: toCountMap(paymentsByStatus, 'status'),
    totalRevenue: paymentRevenue._sum.amount ?? 0,
    revenueByPurpose: Object.fromEntries(revenueByPurpose.map((r) => [r.purpose, r._sum.amount ?? 0])),
    revenueTrend: trend,
    refundsByStatus: toCountMap(refundsByStatus, 'status'),
    openTicketsPerDepartment,
    leadsByStage: toCountMap(leadsByStage, 'stage'),
  };
}
