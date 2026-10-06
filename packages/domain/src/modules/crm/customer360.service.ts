import { prisma } from '../../lib/db';
import { NotFoundError } from '../../lib/errors';
import { canReadAllLeads, leadVisibilityWhere, requireCrmAccess, type CrmActor } from './rbac';

// Customer 360 (docs/CRM-IMPLEMENTATION-PLAN.md, default for D5): the CRM shows
// counts, dates, statuses and totals from the operational modules. It never
// reads clinical content (notes, prescriptions, reports, diagnoses) and never
// returns ticket messages. Each query reads only the fields it needs.

const OPEN_TICKET = ['OPEN', 'IN_PROGRESS', 'WAITING_CUSTOMER', 'WAITING_PARTNER'] as const;
const UPCOMING_APPOINTMENT = ['PENDING_PAYMENT', 'CONFIRMED'] as const;

// Who a customer is for this actor. Agents see a customer only through a lead
// they can see; read-all roles can open any patient by id.
async function resolveCustomer(userId: string, actor: CrmActor) {
  const user = await prisma.user.findFirst({
    where: { id: userId, role: 'PATIENT' },
    select: { id: true, name: true, mobile: true, email: true, createdAt: true },
  });
  if (!user) throw new NotFoundError('Customer not found');

  const linkedLead = await prisma.crmLead.findFirst({
    where: {
      AND: [
        leadVisibilityWhere(actor),
        { OR: [{ mobile: user.mobile }, ...(user.email ? [{ email: user.email }] : [])] },
      ],
    },
    select: { id: true, stage: true, source: true, campaign: true, assignedTo: { select: { name: true } } },
  });
  if (!linkedLead && !canReadAllLeads(actor)) throw new NotFoundError('Customer not found');
  return { user, linkedLead };
}

export async function customerSummary(userId: string, actor: CrmActor, now = new Date()) {
  requireCrmAccess(actor);
  const { user, linkedLead } = await resolveCustomer(userId, actor);

  const [
    appointmentsTotal,
    upcomingAppointments,
    lastAppointment,
    panchakarmaTotal,
    lastPanchakarma,
    diagnosticsTotal,
    lastDiagnostic,
    medicineOrdersTotal,
    lastMedicineOrder,
    paid,
    refunded,
    ticketsOpen,
    ticketsClosed,
    lastTicket,
    openTasks,
  ] = await Promise.all([
    prisma.appointment.count({ where: { patientUserId: user.id } }),
    prisma.appointment.count({
      where: { patientUserId: user.id, status: { in: [...UPCOMING_APPOINTMENT] }, scheduledAt: { gte: now } },
    }),
    prisma.appointment.findFirst({
      where: { patientUserId: user.id },
      orderBy: { scheduledAt: 'desc' },
      select: { scheduledAt: true, status: true },
    }),
    prisma.panchakarmaBooking.count({ where: { patientUserId: user.id } }),
    prisma.panchakarmaBooking.findFirst({
      where: { patientUserId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { status: true, createdAt: true },
    }),
    prisma.diagnosticOrder.count({ where: { patientUserId: user.id } }),
    prisma.diagnosticOrder.findFirst({
      where: { patientUserId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { status: true, createdAt: true },
    }),
    prisma.medicineOrder.count({ where: { patientUserId: user.id } }),
    prisma.medicineOrder.findFirst({
      where: { patientUserId: user.id },
      orderBy: { createdAt: 'desc' },
      select: { status: true, createdAt: true },
    }),
    prisma.payment.aggregate({
      where: { payerUserId: user.id, status: 'SUCCESS' },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.refund.aggregate({
      where: { status: 'COMPLETED', payment: { payerUserId: user.id } },
      _sum: { amount: true },
      _count: { _all: true },
    }),
    prisma.supportTicket.count({
      where: {
        OR: [{ requesterUserId: user.id }, { linkedPatientUserId: user.id }],
        status: { in: [...OPEN_TICKET] },
      },
    }),
    prisma.supportTicket.count({
      where: {
        OR: [{ requesterUserId: user.id }, { linkedPatientUserId: user.id }],
        status: { in: ['RESOLVED', 'CLOSED'] },
      },
    }),
    prisma.supportTicket.findFirst({
      where: { OR: [{ requesterUserId: user.id }, { linkedPatientUserId: user.id }] },
      orderBy: { createdAt: 'desc' },
      select: { status: true, createdAt: true },
    }),
    linkedLead
      ? prisma.crmTask.count({
          where: { leadId: linkedLead.id, status: { in: ['TODO', 'IN_PROGRESS', 'BLOCKED'] } },
        })
      : Promise.resolve(0),
  ]);

  return {
    customer: { id: user.id, name: user.name, mobile: user.mobile, email: user.email, customerSince: user.createdAt },
    crm: linkedLead
      ? {
          leadId: linkedLead.id,
          stage: linkedLead.stage,
          source: linkedLead.source,
          campaign: linkedLead.campaign,
          owner: linkedLead.assignedTo?.name ?? null,
          openTasks,
        }
      : null,
    healthcare: {
      appointments: { total: appointmentsTotal, upcoming: upcomingAppointments, last: lastAppointment },
      panchakarma: { total: panchakarmaTotal, last: lastPanchakarma },
      diagnostics: { total: diagnosticsTotal, last: lastDiagnostic },
    },
    commerce: { medicineOrders: { total: medicineOrdersTotal, last: lastMedicineOrder } },
    finance: {
      paidCount: paid._count._all,
      totalPaid: paid._sum.amount ?? 0,
      refundCount: refunded._count._all,
      totalRefunded: refunded._sum.amount ?? 0,
      outstanding: null,
    },
    support: { open: ticketsOpen, closed: ticketsClosed, last: lastTicket },
  };
}

