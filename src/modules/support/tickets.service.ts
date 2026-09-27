import type { StaffDepartment, SupportTicketStatus, UserRole } from '@prisma/client';
import type { z } from 'zod';
import { prisma } from '@/lib/db';
import { assertUploadAllowed, putObject } from '@/lib/storage';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError } from '@/lib/errors';
import { notify } from '@/modules/notifications/notifications.service';
import { listRefundablePayments } from '@/modules/payments/refunds.service';
import { recordAuditEvent, type AuditContext } from '@/server/audit';
import { randomUUID } from 'crypto';
import { buildSlaSnapshot, defaultDepartmentFor, defaultPriorityFor } from './sla';
import type { createTicketSchema, triageTicketSchema, updateStatusSchema } from './tickets.schemas';

type CreateTicketInput = z.infer<typeof createTicketSchema>;
type TriageInput = z.infer<typeof triageTicketSchema>;
type UpdateStatusInput = z.infer<typeof updateStatusSchema>;

interface UploadedFile {
  originalName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
}

// The one staff role each of the four CRM roles maps to (StaffProfile is
// provisioned with this same department by modules/staff — see
// docs/DOMAIN-MODEL.md §12's four-department queue).
export function departmentForRole(role: UserRole): StaffDepartment | null {
  switch (role) {
    case 'CUSTOMER_SUPPORT':
      return 'CUSTOMER_SUPPORT';
    case 'TECH_SUPPORT':
      return 'TECH_SUPPORT';
    case 'SALES':
      return 'SALES';
    case 'CARE_COORDINATOR':
      return 'CARE_COORDINATION';
    default:
      return null;
  }
}

function detailInclude() {
  return {
    requester: { select: { id: true, mobile: true, role: true } },
    linkedPatient: { select: { id: true, mobile: true, patientProfile: { select: { firstName: true, lastName: true } } } },
    assignedAgent: { select: { id: true, mobile: true } },
    messages: { orderBy: { createdAt: 'asc' as const }, include: { author: { select: { id: true, mobile: true, role: true } }, attachments: true } },
    attachments: true,
  };
}

function canView(
  ticket: { requesterUserId: string; linkedPatientUserId: string | null; assignedAgentUserId: string | null; department: StaffDepartment },
  userId: string,
  role: UserRole,
): boolean {
  if (role === 'ADMIN') return true;
  if (ticket.requesterUserId === userId || ticket.linkedPatientUserId === userId) return true;
  if (ticket.assignedAgentUserId === userId) return true;
  return departmentForRole(role) === ticket.department;
}

export async function createTicket(requesterUserId: string, requesterRole: UserRole, dto: CreateTicketInput, auditCtx: AuditContext) {
  let linkedPatientUserId: string | undefined;
  if (requesterRole === 'PATIENT') {
    linkedPatientUserId = requesterUserId;
  } else if (dto.linkedPatientMobile) {
    const patient = await prisma.user.findUnique({ where: { mobile: dto.linkedPatientMobile } });
    if (!patient || patient.role !== 'PATIENT') throw new NotFoundError('No patient found with that mobile number');
    linkedPatientUserId = patient.id;
  }

  const priority = defaultPriorityFor(dto.category);
  const department = defaultDepartmentFor(dto.category);
  const createdAt = new Date();

  const ticket = await prisma.supportTicket.create({
    data: {
      requesterUserId,
      category: dto.category,
      department,
      priority,
      channel: dto.channel ?? (requesterRole === 'PATIENT' ? 'IN_APP' : 'WEB_FORM'),
      subject: dto.subject,
      description: dto.description,
      linkedPatientUserId,
      linkedAppointmentId: dto.linkedAppointmentId,
      linkedMedicineOrderId: dto.linkedMedicineOrderId,
      linkedDiagnosticOrderId: dto.linkedDiagnosticOrderId,
      linkedPanchakarmaBookingId: dto.linkedPanchakarmaBookingId,
      createdAt,
      sla: buildSlaSnapshot(priority, createdAt),
    },
  });

  await recordAuditEvent(auditCtx, {
    eventType: 'SUPPORT_TICKET',
    action: 'CREATED',
    resourceType: 'SupportTicket',
    resourceId: ticket.id,
    metadata: { category: dto.category, department, priority },
  });

  return ticket;
}

export async function getTicket(ticketId: string, userId: string, role: UserRole) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId }, include: detailInclude() });
  if (!ticket || !canView(ticket, userId, role)) throw new NotFoundError('Ticket not found');

  // Staff working a ticket about a specific patient can see that patient's
  // refundable payments right here, rather than needing a separate
  // payments-search screen — see modules/payments/refunds.service.ts.
  let refundablePayments: Awaited<ReturnType<typeof listRefundablePayments>> = [];
  if (role !== 'PATIENT' && ticket.linkedPatientUserId) {
    refundablePayments = await listRefundablePayments(ticket.linkedPatientUserId);
  }

  return { ...ticket, refundablePayments };
}

export async function listMineAsRequester(userId: string) {
  return prisma.supportTicket.findMany({
    where: { OR: [{ requesterUserId: userId }, { linkedPatientUserId: userId }] },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listQueue(role: UserRole, status?: SupportTicketStatus) {
  const department = departmentForRole(role);
  if (!department && role !== 'ADMIN') throw new ForbiddenError('This role has no support queue');
  return prisma.supportTicket.findMany({
    where: { ...(department ? { department } : {}), ...(status ? { status } : {}) },
    include: { requester: { select: { mobile: true } }, assignedAgent: { select: { mobile: true } } },
    orderBy: [{ priority: 'asc' }, { createdAt: 'asc' }],
  });
}

export async function claimTicket(ticketId: string, agentUserId: string, agentRole: UserRole, auditCtx: AuditContext) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new NotFoundError('Ticket not found');
  const department = departmentForRole(agentRole);
  if (agentRole !== 'ADMIN' && department !== ticket.department) {
    throw new ForbiddenError('This ticket belongs to a different department');
  }
  if (ticket.assignedAgentUserId && ticket.assignedAgentUserId !== agentUserId) {
    throw new ConflictError('This ticket is already claimed by another agent');
  }

  const updated = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: { assignedAgentUserId: agentUserId, status: ticket.status === 'OPEN' ? 'IN_PROGRESS' : ticket.status },
  });
  await recordAuditEvent(auditCtx, { eventType: 'SUPPORT_TICKET', action: 'CLAIMED', resourceType: 'SupportTicket', resourceId: ticketId });
  return updated;
}

export async function triageTicket(ticketId: string, actorRole: UserRole, dto: TriageInput, auditCtx: AuditContext) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new NotFoundError('Ticket not found');
  const department = departmentForRole(actorRole);
  if (actorRole !== 'ADMIN' && department !== ticket.department) {
    throw new ForbiddenError('This ticket belongs to a different department');
  }

  const updated = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: {
      department: dto.department ?? ticket.department,
      priority: dto.priority ?? ticket.priority,
      sla: dto.priority ? buildSlaSnapshot(dto.priority, ticket.createdAt) : undefined,
    },
  });
  await recordAuditEvent(auditCtx, {
    eventType: 'SUPPORT_TICKET',
    action: 'TRIAGED',
    resourceType: 'SupportTicket',
    resourceId: ticketId,
    metadata: dto,
  });
  return updated;
}

// State machine per docs/DOMAIN-MODEL.md §12: OPEN -> IN_PROGRESS ->
// {WAITING_CUSTOMER | WAITING_PARTNER} -> IN_PROGRESS -> RESOLVED -> CLOSED,
// "any state may re-open to IN_PROGRESS".
const ALLOWED_TRANSITIONS: Record<SupportTicketStatus, SupportTicketStatus[]> = {
  OPEN: ['IN_PROGRESS'],
  IN_PROGRESS: ['WAITING_CUSTOMER', 'WAITING_PARTNER', 'RESOLVED'],
  WAITING_CUSTOMER: ['IN_PROGRESS'],
  WAITING_PARTNER: ['IN_PROGRESS'],
  RESOLVED: ['CLOSED', 'IN_PROGRESS'],
  CLOSED: ['IN_PROGRESS'],
};

export async function updateStatus(ticketId: string, actorUserId: string, actorRole: UserRole, dto: UpdateStatusInput, auditCtx: AuditContext) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new NotFoundError('Ticket not found');
  if (!canView(ticket, actorUserId, actorRole) || actorRole === 'PATIENT') {
    throw new ForbiddenError('Not allowed to change this ticket\'s status');
  }
  if (dto.status !== 'IN_PROGRESS' && !ALLOWED_TRANSITIONS[ticket.status].includes(dto.status)) {
    throw new BadRequestError(`Cannot move a ${ticket.status} ticket to ${dto.status}`);
  }

  const updated = await prisma.supportTicket.update({
    where: { id: ticketId },
    data: { status: dto.status, resolvedAt: dto.status === 'RESOLVED' ? new Date() : ticket.resolvedAt },
  });
  await recordAuditEvent(auditCtx, {
    eventType: 'SUPPORT_TICKET',
    action: 'STATUS_CHANGED',
    resourceType: 'SupportTicket',
    resourceId: ticketId,
    metadata: { from: ticket.status, to: dto.status },
  });

  if (dto.status === 'RESOLVED' || dto.status === 'WAITING_CUSTOMER') {
    await notify(ticket.requesterUserId, 'IN_APP', `support.ticket_${dto.status.toLowerCase()}`, { ticketId });
  }
  return updated;
}

export async function addMessage(ticketId: string, authorUserId: string, authorRole: UserRole, body: string, auditCtx: AuditContext) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new NotFoundError('Ticket not found');
  if (!canView(ticket, authorUserId, authorRole)) throw new NotFoundError('Ticket not found');
  if (ticket.status === 'CLOSED') throw new ConflictError('This ticket is closed — reopen it before replying');

  const isStaffAuthor = authorRole !== 'PATIENT';
  const nextStatus: SupportTicketStatus = isStaffAuthor
    ? ticket.status === 'OPEN'
      ? 'IN_PROGRESS'
      : ticket.status
    : ticket.status === 'RESOLVED' || ticket.status === 'WAITING_CUSTOMER'
      ? 'IN_PROGRESS'
      : ticket.status;

  const [message] = await prisma.$transaction([
    prisma.supportMessage.create({ data: { ticketId, authorUserId, body } }),
    prisma.supportTicket.update({ where: { id: ticketId }, data: { status: nextStatus, lastResponseAt: new Date() } }),
  ]);

  await recordAuditEvent(auditCtx, { eventType: 'SUPPORT_TICKET', action: 'MESSAGE_ADDED', resourceType: 'SupportTicket', resourceId: ticketId });

  const notifyUserId = isStaffAuthor ? ticket.requesterUserId : ticket.assignedAgentUserId;
  if (notifyUserId) await notify(notifyUserId, 'IN_APP', 'support.new_message', { ticketId, messageId: message.id });

  return message;
}

export async function addAttachment(ticketId: string, uploaderUserId: string, uploaderRole: UserRole, file: UploadedFile, messageId?: string) {
  const ticket = await prisma.supportTicket.findUnique({ where: { id: ticketId } });
  if (!ticket) throw new NotFoundError('Ticket not found');
  if (!canView(ticket, uploaderUserId, uploaderRole)) throw new NotFoundError('Ticket not found');
  assertUploadAllowed({ mimetype: file.mimeType, size: file.size });

  const storedName = `${randomUUID()}-${file.originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const storageKey = `support-attachments/${ticketId}/${storedName}`;
  await putObject({ key: storageKey, body: file.buffer, contentType: file.mimeType });

  return prisma.supportAttachment.create({
    data: {
      ticketId,
      messageId,
      storageKey,
      originalName: file.originalName,
      mimeType: file.mimeType,
      sizeBytes: file.size,
      uploadedByUserId: uploaderUserId,
    },
  });
}
