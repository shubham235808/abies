import { prisma } from '../../lib/db';
import { logger } from '../../lib/logger';
import { recordAuditEvent, type AuditContext } from '../../server/audit';
import { notifyMailbox } from '../notifications/notifications.service';
import { getOrganizationContact } from './organization';
import type { ContactInput } from './contact.schemas';

const QUERY_LABEL: Record<ContactInput['queryType'], string> = {
  GENERAL: 'General enquiry',
  APPOINTMENT: 'Doctor appointment',
  PANCHAKARMA: 'Panchakarma',
  DIAGNOSTICS: 'Diagnostics',
  ORDERS: 'Orders and delivery',
  PAYMENT: 'Payment',
  ACCOUNT: 'Account and login',
  TECHNICAL: 'Website or app problem',
  OTHER: 'Other',
};

// ENQ-YYYY-NNNNNN from a Postgres sequence, so two submissions at the same time
// never share a number. The year is the IST year.
export async function nextContactReference(now = new Date()): Promise<string> {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`SELECT nextval('"ContactEnquiry_ref_seq"') AS n`;
  const ist = new Date(now.getTime() + 5.5 * 60 * 60 * 1000);
  return `ENQ-${ist.getUTCFullYear()}-${String(Number(rows[0]!.n)).padStart(6, '0')}`;
}

// Runs one email enqueue. A failure here is logged and returns null: the enquiry
// is already stored, and the caller still gets its reference.
async function enqueueEmail<T>(referenceId: string, which: string, send: () => Promise<T>): Promise<T | null> {
  try {
    return await send();
  } catch (err) {
    logger.error('contact', `could not queue the ${which} email`, err, { referenceId });
    return null;
  }
}

export interface ContactSubmission {
  referenceId: string;
}

// Stores the enquiry first, then sends the internal copy to the support mailbox
// and the acknowledgement to the enquirer. Neither send can lose the enquiry or
// fail the submission. Nothing secret goes into the audit event; the message is
// kept only on the enquiry row and in the internal email.
export async function submitContactEnquiry(input: ContactInput, ctx: AuditContext): Promise<ContactSubmission> {
  const now = new Date();
  const referenceId = await nextContactReference(now);

  const enquiry = await prisma.contactEnquiry.create({
    data: {
      referenceId,
      name: input.name,
      email: input.email,
      mobile: input.mobile,
      queryType: input.queryType,
      subject: input.subject,
      message: input.message,
      preferredContact: input.preferredContact ?? null,
      consentAcknowledged: true,
      linkedUserId: ctx.userId ?? null,
    },
  });

  await recordAuditEvent(ctx, {
    eventType: 'contact',
    action: 'enquiry.created',
    resourceType: 'ContactEnquiry',
    resourceId: enquiry.id,
    metadata: { referenceId, queryType: input.queryType, signedIn: Boolean(ctx.userId) },
  });

  const org = getOrganizationContact();
  const submittedAt = new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(now);

  const internal = await enqueueEmail(referenceId, 'internal', () =>
    notifyMailbox(
      org.supportEmail,
      'EMAIL',
      'contact.enquiry.internal',
      {
        referenceId,
        name: input.name,
        email: input.email,
        mobile: input.mobile,
        queryType: QUERY_LABEL[input.queryType],
        subject: input.subject,
        message: input.message,
        preferredContact: input.preferredContact ?? 'Not specified',
        submittedAt,
      },
      { idempotencyKey: `contact:${referenceId}:internal` },
    ),
  );

  const acknowledgement = await enqueueEmail(referenceId, 'acknowledgement', () =>
    notifyMailbox(
      input.email,
      'EMAIL',
      'contact.enquiry.acknowledgement',
      { name: input.name, referenceId },
      { idempotencyKey: `contact:${referenceId}:ack` },
    ),
  );

  await prisma.contactEnquiry.update({
    where: { id: enquiry.id },
    data: {
      internalNotificationId: internal?.id ?? null,
      acknowledgementNotificationId: acknowledgement?.id ?? null,
    },
  });

  return { referenceId };
}
