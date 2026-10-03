import type { z } from 'zod';
import { randomUUID } from 'crypto';
import { prisma } from '../../lib/db';
import { assertUploadAllowed, putObject } from '../../lib/storage';
import { ConflictError, NotFoundError } from '../../lib/errors';
import { recordAuditEvent, type AuditContext } from '../../server/audit';
import type { createLeadSchema, updateLeadSchema } from './leads.schemas';

type CreateLeadInput = z.infer<typeof createLeadSchema>;
type UpdateLeadInput = z.infer<typeof updateLeadSchema>;

interface UploadedFile {
  originalName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
}

// An ADMIN creating a lead (e.g. logging one from an offline event) doesn't
// become its owner — only a SALES actor creating their own lead does.
// Admin-created leads land unowned in the shared pool for any rep to claim.
export async function createLead(actorUserId: string, actorRole: 'SALES' | 'ADMIN', dto: CreateLeadInput, auditCtx: AuditContext) {
  const lead = await prisma.partnerLead.create({ data: { ...dto, ownerUserId: actorRole === 'SALES' ? actorUserId : undefined } });
  await recordAuditEvent(auditCtx, { eventType: 'PARTNER_LEAD', action: 'CREATED', resourceType: 'PartnerLead', resourceId: lead.id, metadata: { kind: dto.kind } });
  return lead;
}

// Sales pipeline is shared across the whole team, not siloed per rep —
// same "department queue, not personal inbox" visibility as support
// tickets. ownerUserId is who's actively working it, not a visibility gate.
export async function listLeads(stage?: UpdateLeadInput['stage']) {
  return prisma.partnerLead.findMany({
    where: stage ? { stage } : undefined,
    include: { owner: { select: { mobile: true } } },
    orderBy: [{ nextFollowUpAt: 'asc' }, { createdAt: 'desc' }],
    // Same unbounded-lifetime-list concern as tickets.service.ts's
    // listQueue — a hard ceiling, not full pagination, since a stage
    // filter already keeps the common case well under this.
    take: 200,
  });
}

export async function getLead(id: string) {
  const lead = await prisma.partnerLead.findUnique({ where: { id }, include: { owner: { select: { mobile: true } } } });
  if (!lead) throw new NotFoundError('Lead not found');
  return lead;
}

export async function claimLead(id: string, salesUserId: string, auditCtx: AuditContext) {
  const lead = await prisma.partnerLead.findUnique({ where: { id } });
  if (!lead) throw new NotFoundError('Lead not found');
  if (lead.ownerUserId && lead.ownerUserId !== salesUserId) throw new ConflictError('This lead already has an owner');

  const updated = await prisma.partnerLead.update({ where: { id }, data: { ownerUserId: salesUserId } });
  await recordAuditEvent(auditCtx, { eventType: 'PARTNER_LEAD', action: 'CLAIMED', resourceType: 'PartnerLead', resourceId: id });
  return updated;
}

export async function updateLead(id: string, dto: UpdateLeadInput, auditCtx: AuditContext) {
  const lead = await prisma.partnerLead.findUnique({ where: { id } });
  if (!lead) throw new NotFoundError('Lead not found');

  const updated = await prisma.partnerLead.update({
    where: { id },
    data: {
      stage: dto.stage,
      notes: dto.notes,
      nextFollowUpAt: dto.nextFollowUpAt === undefined ? undefined : dto.nextFollowUpAt ? new Date(dto.nextFollowUpAt) : null,
    },
  });
  await recordAuditEvent(auditCtx, {
    eventType: 'PARTNER_LEAD',
    action: 'UPDATED',
    resourceType: 'PartnerLead',
    resourceId: id,
    metadata: { stage: dto.stage },
  });
  return updated;
}

// Stage-history timeline for the lead detail page — sourced from the
// existing AuditEvent trail (every stage change already writes one via
// updateLead above) rather than a new table.
export async function listLeadHistory(leadId: string) {
  return prisma.auditEvent.findMany({
    where: { resourceType: 'PartnerLead', resourceId: leadId },
    orderBy: { createdAt: 'asc' },
  });
}

export async function addLeadDocument(id: string, uploaderUserId: string, file: UploadedFile, auditCtx: AuditContext) {
  const lead = await prisma.partnerLead.findUnique({ where: { id } });
  if (!lead) throw new NotFoundError('Lead not found');
  assertUploadAllowed({ mimetype: file.mimeType, size: file.size });

  const storedName = `${randomUUID()}-${file.originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const storageKey = `partner-lead-documents/${id}/${storedName}`;
  await putObject({ key: storageKey, body: file.buffer, contentType: file.mimeType });

  const updated = await prisma.partnerLead.update({
    where: { id },
    data: { documentKeys: { push: storageKey } },
  });
  await recordAuditEvent(auditCtx, {
    eventType: 'PARTNER_LEAD',
    action: 'DOCUMENT_UPLOADED',
    resourceType: 'PartnerLead',
    resourceId: id,
    metadata: { uploadedBy: uploaderUserId, originalName: file.originalName },
  });
  return updated;
}
