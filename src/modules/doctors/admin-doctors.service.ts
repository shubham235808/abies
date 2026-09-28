import { DoctorDocumentStatus, DoctorVerificationStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { getSignedDownloadUrl } from '@/lib/storage';
import { recordAuditEvent } from '@/server/audit';
import type { AuditContext } from '@/server/audit';

// Ported from the validated Sprint 3 admin verification workflow
// (docs/DECISIONS.md D3): approval requires both mandatory documents to be
// individually VERIFIED, and every transition writes an immutable
// DoctorVerificationAction row plus a general AuditEvent.

function includeFull() {
  return {
    user: { select: { id: true, mobile: true, email: true, status: true, createdAt: true } },
    documents: { orderBy: { createdAt: 'desc' as const } },
    clinics: { orderBy: { createdAt: 'asc' as const } },
    availability: { orderBy: [{ dayOfWeek: 'asc' as const }, { startTime: 'asc' as const }] },
    verificationActions: { orderBy: { createdAt: 'desc' as const }, take: 50 },
  };
}

export async function queue(status?: DoctorVerificationStatus) {
  const where: Prisma.DoctorProfileWhereInput = status
    ? { verificationStatus: status }
    : { verificationStatus: { in: [DoctorVerificationStatus.SUBMITTED, DoctorVerificationStatus.UNDER_REVIEW] } };

  const doctors = await prisma.doctorProfile.findMany({
    where,
    include: { user: { select: { mobile: true, email: true } }, documents: true, clinics: true },
    orderBy: [{ submittedAt: 'asc' }, { createdAt: 'asc' }],
  });

  return {
    total: doctors.length,
    doctors: doctors.map((d) => ({
      id: d.id,
      slug: d.slug,
      name: [d.title, d.firstName, d.lastName].filter(Boolean).join(' '),
      mobile: d.user.mobile,
      email: d.user.email,
      qualification: d.highestQualification || d.primaryQualification,
      registrationCouncil: d.registrationCouncil,
      registrationNumber: d.registrationNumber,
      specialties: d.specialties,
      verificationStatus: d.verificationStatus,
      submittedAt: d.submittedAt,
      documentCount: d.documents.length,
      clinicCount: d.clinics.length,
      rejectionReason: d.rejectionReason,
    })),
  };
}

export async function detail(id: string) {
  const doctor = await prisma.doctorProfile.findUnique({ where: { id }, include: includeFull() });
  if (!doctor) throw new NotFoundError('Doctor application not found');
  return { doctor };
}

async function transition(
  id: string,
  adminUserId: string,
  toStatus: DoctorVerificationStatus,
  notes: string | undefined,
  extra: Prisma.DoctorProfileUpdateInput,
) {
  const doctor = await prisma.doctorProfile.findUnique({ where: { id } });
  if (!doctor) throw new NotFoundError('Doctor application not found');

  const updated = await prisma.$transaction(async (tx) => {
    const profile = await tx.doctorProfile.update({
      where: { id },
      data: {
        verificationStatus: toStatus,
        reviewedAt: ['APPROVED', 'REJECTED', 'SUSPENDED'].includes(toStatus) ? new Date() : doctor.reviewedAt,
        reviewedByUserId: adminUserId,
        ...extra,
      },
    });
    await tx.doctorVerificationAction.create({
      data: { doctorProfileId: id, adminUserId, fromStatus: doctor.verificationStatus, toStatus, notes },
    });
    return profile;
  });

  return { doctor: updated };
}

export async function startReview(id: string, adminCtx: AuditContext & { userId: string }, notes?: string) {
  const doctor = await prisma.doctorProfile.findUnique({ where: { id } });
  if (!doctor) throw new NotFoundError('Doctor application not found');
  if (doctor.verificationStatus !== DoctorVerificationStatus.SUBMITTED) {
    throw new BadRequestError('Only submitted applications can enter review');
  }
  const result = await transition(id, adminCtx.userId, DoctorVerificationStatus.UNDER_REVIEW, notes, {
    isDiscoverable: false,
  });
  await recordAuditEvent(adminCtx, {
    eventType: 'DOCTOR_VERIFICATION',
    action: 'START_REVIEW',
    resourceType: 'DoctorProfile',
    resourceId: id,
  });
  return result;
}

export async function approve(id: string, adminCtx: AuditContext & { userId: string }, notes?: string) {
  const doctor = await prisma.doctorProfile.findUnique({ where: { id }, include: { documents: true } });
  if (!doctor) throw new NotFoundError('Doctor application not found');
  if (
    doctor.verificationStatus !== DoctorVerificationStatus.SUBMITTED &&
    doctor.verificationStatus !== DoctorVerificationStatus.UNDER_REVIEW
  ) {
    throw new BadRequestError('Application is not ready for approval');
  }
  const reg = doctor.documents.find((d) => d.type === 'REGISTRATION_CERTIFICATE');
  const degree = doctor.documents.find((d) => d.type === 'DEGREE_CERTIFICATE');
  if (!reg || !degree) throw new BadRequestError('Registration and degree documents are required');
  if (reg.status !== DoctorDocumentStatus.VERIFIED || degree.status !== DoctorDocumentStatus.VERIFIED) {
    throw new BadRequestError('Registration and degree documents must be verified before approval');
  }

  const result = await transition(id, adminCtx.userId, DoctorVerificationStatus.APPROVED, notes, {
    isDiscoverable: true,
    rejectionReason: null,
    reviewedAt: new Date(),
  });
  await recordAuditEvent(adminCtx, {
    eventType: 'DOCTOR_VERIFICATION',
    action: 'APPROVE',
    resourceType: 'DoctorProfile',
    resourceId: id,
  });
  return result;
}

export async function reject(id: string, adminCtx: AuditContext & { userId: string }, reason: string) {
  const doctor = await prisma.doctorProfile.findUnique({ where: { id } });
  if (!doctor) throw new NotFoundError('Doctor application not found');
  if (
    doctor.verificationStatus !== DoctorVerificationStatus.SUBMITTED &&
    doctor.verificationStatus !== DoctorVerificationStatus.UNDER_REVIEW
  ) {
    throw new BadRequestError('Application is not in review');
  }
  const result = await transition(id, adminCtx.userId, DoctorVerificationStatus.REJECTED, reason, {
    isDiscoverable: false,
    rejectionReason: reason,
    reviewedAt: new Date(),
  });
  await recordAuditEvent(adminCtx, {
    eventType: 'DOCTOR_VERIFICATION',
    action: 'REJECT',
    resourceType: 'DoctorProfile',
    resourceId: id,
  });
  return result;
}

export async function suspend(id: string, adminCtx: AuditContext & { userId: string }, reason: string) {
  const doctor = await prisma.doctorProfile.findUnique({ where: { id } });
  if (!doctor) throw new NotFoundError('Doctor application not found');
  if (doctor.verificationStatus !== DoctorVerificationStatus.APPROVED) {
    throw new BadRequestError('Only approved doctors can be suspended');
  }
  const result = await transition(id, adminCtx.userId, DoctorVerificationStatus.SUSPENDED, reason, {
    isDiscoverable: false,
    rejectionReason: reason,
    reviewedAt: new Date(),
  });
  await recordAuditEvent(adminCtx, {
    eventType: 'DOCTOR_VERIFICATION',
    action: 'SUSPEND',
    resourceType: 'DoctorProfile',
    resourceId: id,
  });
  return result;
}

type DocumentReviewOutcome = 'VERIFY' | 'REJECT' | 'REQUEST_RESUBMISSION';

const STATUS_FOR_OUTCOME: Record<DocumentReviewOutcome, DoctorDocumentStatus> = {
  VERIFY: DoctorDocumentStatus.VERIFIED,
  REJECT: DoctorDocumentStatus.REJECTED,
  // ENTERPRISE-5 — a softer outcome than REJECT: tells the doctor exactly
  // what to fix and re-upload, rather than treating a fixable issue (a
  // blurry scan, a name mismatch) the same as a hard rejection.
  REQUEST_RESUBMISSION: DoctorDocumentStatus.RESUBMISSION_REQUIRED,
};

export async function reviewDocument(
  doctorId: string,
  documentId: string,
  adminCtx: AuditContext & { userId: string },
  outcome: DocumentReviewOutcome,
  note?: string,
) {
  const document = await prisma.doctorDocument.findFirst({ where: { id: documentId, doctorProfileId: doctorId } });
  if (!document) throw new NotFoundError('Document not found');

  const updated = await prisma.doctorDocument.update({
    where: { id: documentId },
    data: {
      status: STATUS_FOR_OUTCOME[outcome],
      reviewNote: note,
      verifiedAt: outcome === 'VERIFY' ? new Date() : null,
    },
  });

  await recordAuditEvent(adminCtx, {
    eventType: 'DOCTOR_DOCUMENT_REVIEW',
    action: outcome,
    resourceType: 'DoctorDocument',
    resourceId: documentId,
    metadata: { doctorId, note },
  });
  return { document: updated };
}

export async function documentDownloadUrl(doctorId: string, documentId: string): Promise<string> {
  const document = await prisma.doctorDocument.findFirst({ where: { id: documentId, doctorProfileId: doctorId } });
  if (!document) throw new NotFoundError('Document not found');
  return getSignedDownloadUrl(document.storagePath);
}
