import { prisma } from '@/lib/db';

export interface PatientPaymentRow {
  id: string;
  purpose: string;
  service: string;
  provider: string | null;
  amount: number;
  status: string;
  createdAt: Date;
  refunds: { id: string; amount: number; status: string }[];
}

// docs/ENTERPRISE-GAP-ANALYSIS.md §13 — every field here already exists on
// Payment/Refund (unlike most of this brief's asks, no schema change was
// needed); the only real work is resolving purposeEntityId's polymorphic
// reference (same convention as SupportTicket's linked* fields) into a
// readable service/provider label per purpose type, since Payment itself
// carries no typed FK to any of the four order/booking models.
export async function listMineAsPatient(patientUserId: string): Promise<PatientPaymentRow[]> {
  const payments = await prisma.payment.findMany({
    where: { payerUserId: patientUserId },
    include: { refunds: { select: { id: true, amount: true, status: true } } },
    orderBy: { createdAt: 'desc' },
  });
  if (payments.length === 0) return [];

  const idsByPurpose = {
    CONSULTATION: payments.filter((p) => p.purpose === 'CONSULTATION').map((p) => p.purposeEntityId),
    DIAGNOSTIC_ORDER: payments.filter((p) => p.purpose === 'DIAGNOSTIC_ORDER').map((p) => p.purposeEntityId),
    MEDICINE_ORDER: payments.filter((p) => p.purpose === 'MEDICINE_ORDER').map((p) => p.purposeEntityId),
    PANCHAKARMA_BOOKING: payments.filter((p) => p.purpose === 'PANCHAKARMA_BOOKING').map((p) => p.purposeEntityId),
  };

  const [appointments, diagnosticOrders, medicineOrders, bookings] = await Promise.all([
    prisma.appointment.findMany({
      where: { id: { in: idsByPurpose.CONSULTATION } },
      select: { id: true, doctorProfile: { select: { title: true, firstName: true, lastName: true } } },
    }),
    prisma.diagnosticOrder.findMany({
      where: { id: { in: idsByPurpose.DIAGNOSTIC_ORDER } },
      select: { id: true, lab: { select: { name: true } }, items: { select: { test: { select: { name: true } } } } },
    }),
    prisma.medicineOrder.findMany({
      where: { id: { in: idsByPurpose.MEDICINE_ORDER } },
      select: { id: true, pharmacy: { select: { name: true } } },
    }),
    prisma.panchakarmaBooking.findMany({
      where: { id: { in: idsByPurpose.PANCHAKARMA_BOOKING } },
      select: { id: true, centre: { select: { name: true } }, therapy: { select: { name: true } } },
    }),
  ]);

  const appointmentById = new Map(appointments.map((a) => [a.id, a]));
  const diagnosticOrderById = new Map(diagnosticOrders.map((d) => [d.id, d]));
  const medicineOrderById = new Map(medicineOrders.map((m) => [m.id, m]));
  const bookingById = new Map(bookings.map((b) => [b.id, b]));

  return payments.map((p) => {
    let service = 'Other';
    let provider: string | null = null;
    if (p.purpose === 'CONSULTATION') {
      const a = appointmentById.get(p.purposeEntityId);
      service = 'Consultation';
      provider = a ? [a.doctorProfile.title, a.doctorProfile.firstName, a.doctorProfile.lastName].filter(Boolean).join(' ') : null;
    } else if (p.purpose === 'DIAGNOSTIC_ORDER') {
      const d = diagnosticOrderById.get(p.purposeEntityId);
      service = d?.items.map((i) => i.test?.name).filter(Boolean).join(', ') || 'Diagnostic test';
      provider = d?.lab.name ?? null;
    } else if (p.purpose === 'MEDICINE_ORDER') {
      const m = medicineOrderById.get(p.purposeEntityId);
      service = 'Medicine order';
      provider = m?.pharmacy.name ?? null;
    } else if (p.purpose === 'PANCHAKARMA_BOOKING') {
      const b = bookingById.get(p.purposeEntityId);
      service = b?.therapy.name ?? 'Panchakarma';
      provider = b?.centre.name ?? null;
    }

    return {
      id: p.id,
      purpose: p.purpose,
      service,
      provider,
      amount: p.amount,
      status: p.status,
      createdAt: p.createdAt,
      refunds: p.refunds,
    };
  });
}
