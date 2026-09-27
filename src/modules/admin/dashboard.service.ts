import { prisma } from '@/lib/db';

function toCountMap<K extends string, R extends Record<K, string> & { _count: { _all: number } }>(
  rows: R[],
  key: K,
): Record<string, number> {
  return Object.fromEntries(rows.map((r) => [r[key], r._count._all]));
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
    prisma.payment.aggregate({ where: { status: { in: ['SUCCESS', 'PARTIALLY_REFUNDED'] } }, _sum: { amount: true } }),
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
    refundsByStatus: toCountMap(refundsByStatus, 'status'),
    openTicketsPerDepartment,
    leadsByStage: toCountMap(leadsByStage, 'stage'),
  };
}
