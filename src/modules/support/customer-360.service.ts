import { prisma } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { listMineAsPatient as listAppointments } from '@/modules/appointments/appointments.service';
import { listMineAsPatient as listDiagnosticOrders } from '@/modules/diagnostics/orders.service';
import { listMineAsPatient as listMedicineOrders } from '@/modules/medicines/orders.service';
import { listMineAsPatient as listPanchakarmaBookings } from '@/modules/panchakarma/bookings.service';
import { listMineAsPatient as listPayments } from '@/modules/payments/payments.service';
import { listMineAsRequester as listTickets } from '@/modules/support/tickets.service';

// ENTERPRISE-9 (docs/ENTERPRISE-GAP-ANALYSIS.md §42) — a Customer Support
// agent opening a patient from a ticket, aggregated from the exact same
// listMineAsPatient()-style queries the patient's own dashboard already
// uses (Phase 4-13 code, unchanged) — no new query logic, no schema
// change. Deliberately excludes clinical content: appointments/orders/
// bookings carry only status/date/provider fields, never diagnosis,
// treatment plan, or prescription detail — the least-privilege boundary
// docs/ENTERPRISE-GAP-ANALYSIS.md §71 already holds elsewhere in this app
// (Support's ticket view already excludes clinical notes).
export async function getCustomerSummary(patientUserId: string) {
  const user = await prisma.user.findUnique({
    where: { id: patientUserId },
    include: { patientProfile: true },
  });
  if (!user || user.role !== 'PATIENT') throw new NotFoundError('Patient not found');

  const [appointments, diagnosticOrders, medicineOrders, panchakarmaBookings, payments, tickets] = await Promise.all([
    listAppointments(patientUserId),
    listDiagnosticOrders(patientUserId),
    listMedicineOrders(patientUserId),
    listPanchakarmaBookings(patientUserId),
    listPayments(patientUserId),
    listTickets(patientUserId),
  ]);

  return {
    patient: {
      id: user.id,
      mobile: user.mobile,
      name: [user.patientProfile?.firstName, user.patientProfile?.lastName].filter(Boolean).join(' ') || null,
      city: user.patientProfile?.city ?? null,
    },
    appointments: appointments.map((a) => ({
      id: a.id,
      status: a.status,
      scheduledAt: a.scheduledAt,
      mode: a.mode,
      doctorName: [a.doctorProfile.title, a.doctorProfile.firstName, a.doctorProfile.lastName].filter(Boolean).join(' '),
    })),
    diagnosticOrders: diagnosticOrders.map((o) => ({
      id: o.id,
      status: o.status,
      labName: o.lab.name,
      testNames: o.items.map((i) => i.test?.name).filter((n): n is string => Boolean(n)),
    })),
    medicineOrders: medicineOrders.map((o) => ({ id: o.id, status: o.status, pharmacyName: o.pharmacy.name })),
    panchakarmaBookings: panchakarmaBookings.map((b) => ({ id: b.id, status: b.status, therapyName: b.therapy.name })),
    payments: payments.map((p) => ({ id: p.id, service: p.service, amount: p.amount, status: p.status, createdAt: p.createdAt })),
    openTickets: tickets
      .filter((t) => t.status !== 'RESOLVED' && t.status !== 'CLOSED')
      .map((t) => ({ id: t.id, subject: t.subject, category: t.category, priority: t.priority, status: t.status })),
  };
}
