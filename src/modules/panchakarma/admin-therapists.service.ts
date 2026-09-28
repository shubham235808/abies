import { TherapistDocumentStatus } from '@prisma/client';
import { prisma } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { getSignedDownloadUrl } from '@/lib/storage';
import { recordAuditEvent, type AuditContext } from '@/server/audit';

// ENTERPRISE-8/13 — admin-side therapist document review, direct pattern
// reuse of admin-doctors.service.ts's reviewDocument (including the
// ENTERPRISE-5 three-way outcome). "Centre can initiate onboarding but
// must NOT perform final platform verification" (brief §38) — this is
// the one place that verifies/rejects a therapist document; the centre's
// own catalogue.service.ts functions only ever create/list/remove.

type DocumentReviewOutcome = 'VERIFY' | 'REJECT' | 'REQUEST_RESUBMISSION';

const STATUS_FOR_OUTCOME: Record<DocumentReviewOutcome, TherapistDocumentStatus> = {
  VERIFY: TherapistDocumentStatus.VERIFIED,
  REJECT: TherapistDocumentStatus.REJECTED,
  REQUEST_RESUBMISSION: TherapistDocumentStatus.RESUBMISSION_REQUIRED,
};

// Queue surfaces every therapist with at least one non-verified document —
// the admin's worklist, same shape as the doctor/lab/pharmacy/centre
// verification queues.
export async function queue() {
  const therapists = await prisma.therapist.findMany({
    where: { documents: { some: { status: { not: TherapistDocumentStatus.VERIFIED } } } },
    include: {
      centre: { select: { id: true, name: true } },
      documents: { orderBy: { createdAt: 'desc' } },
    },
    orderBy: { createdAt: 'asc' },
  });
  return { therapists, total: therapists.length };
}

export async function detail(therapistId: string) {
  const therapist = await prisma.therapist.findUnique({
    where: { id: therapistId },
    include: {
      centre: { select: { id: true, name: true } },
      documents: { orderBy: { createdAt: 'desc' } },
    },
  });
  if (!therapist) throw new NotFoundError('Therapist not found');
  return therapist;
}

export async function reviewDocument(
  therapistId: string,
  documentId: string,
  adminCtx: AuditContext & { userId: string },
  outcome: DocumentReviewOutcome,
  note?: string,
) {
  const document = await prisma.therapistDocument.findFirst({ where: { id: documentId, therapistId } });
  if (!document) throw new NotFoundError('Document not found');

  const updated = await prisma.therapistDocument.update({
    where: { id: documentId },
    data: {
      status: STATUS_FOR_OUTCOME[outcome],
      reviewNote: note,
      verifiedAt: outcome === 'VERIFY' ? new Date() : null,
    },
  });

  await recordAuditEvent(adminCtx, {
    eventType: 'THERAPIST_DOCUMENT_REVIEW',
    action: outcome,
    resourceType: 'TherapistDocument',
    resourceId: documentId,
    metadata: { therapistId, note },
  });
  return { document: updated };
}

export async function documentDownloadUrl(therapistId: string, documentId: string): Promise<string> {
  const document = await prisma.therapistDocument.findFirst({ where: { id: documentId, therapistId } });
  if (!document) throw new NotFoundError('Document not found');
  return getSignedDownloadUrl(document.storagePath);
}
