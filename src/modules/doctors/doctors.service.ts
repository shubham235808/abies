import { randomUUID } from 'crypto';
import { ConsultationMode, DoctorDocumentType, DoctorVerificationStatus, Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { BadRequestError, ForbiddenError, NotFoundError } from '@/lib/errors';
import { assertUploadAllowed, deleteObject, getSignedDownloadUrl, putObject } from '@/lib/storage';
import { recordAuditEvent } from '@/server/audit';
import type { AuditContext } from '@/server/audit';
import type {
  createAvailabilitySchema,
  createClinicSchema,
  updateAvailabilitySchema,
  updateClinicSchema,
  updateDoctorProfileSchema,
} from './doctors.schemas';
import type { z } from 'zod';

// Business rules ported from the validated Sprint 3 NestJS implementation
// (docs/DECISIONS.md D3): slug generation, edit-lock by verification status,
// mode-gated availability, the submission checklist, and the public
// discoverability rule are all preserved.

type UpdateProfileInput = z.infer<typeof updateDoctorProfileSchema>;
type CreateClinicInput = z.infer<typeof createClinicSchema>;
type UpdateClinicInput = z.infer<typeof updateClinicSchema>;
type CreateAvailabilityInput = z.infer<typeof createAvailabilitySchema>;
type UpdateAvailabilityInput = z.infer<typeof updateAvailabilitySchema>;

function slugPart(value?: string | null): string {
  return String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

async function uniqueSlug(firstName?: string | null, lastName?: string | null, userId?: string): Promise<string> {
  const base = [slugPart(firstName), slugPart(lastName)].filter(Boolean).join('-') || `doctor-${String(userId || '').slice(-6)}`;
  let slug = base;
  let n = 2;
  while (await prisma.doctorProfile.findUnique({ where: { slug } })) slug = `${base}-${n++}`;
  return slug;
}

function privateInclude() {
  return {
    documents: { orderBy: { createdAt: 'desc' as const } },
    clinics: { orderBy: { createdAt: 'asc' as const } },
    availability: { orderBy: [{ dayOfWeek: 'asc' as const }, { startTime: 'asc' as const }] },
    verificationActions: { orderBy: { createdAt: 'desc' as const }, take: 20 },
  };
}

export async function ensureProfile(userId: string) {
  const existing = await prisma.doctorProfile.findUnique({ where: { userId }, include: privateInclude() });
  if (existing) return existing;
  return prisma.doctorProfile.create({
    data: { userId, slug: await uniqueSlug(undefined, undefined, userId) },
    include: privateInclude(),
  });
}

function completion(profile: {
  firstName: string | null;
  lastName: string | null;
  registrationCouncil: string | null;
  registrationNumber: string | null;
  primaryQualification: string | null;
  yearsExperience: number | null;
  specialties: string[];
  languages: string[];
  consultationModes: ConsultationMode[];
  bio: string | null;
  documents: { type: DoctorDocumentType }[];
}): number {
  const fields = [
    profile.firstName,
    profile.lastName,
    profile.registrationCouncil,
    profile.registrationNumber,
    profile.primaryQualification,
    profile.yearsExperience !== null && profile.yearsExperience !== undefined,
    profile.specialties.length,
    profile.languages.length,
    profile.consultationModes.length,
    profile.bio,
  ];
  const base = fields.filter(Boolean).length;
  const requiredDocs = [DoctorDocumentType.REGISTRATION_CERTIFICATE, DoctorDocumentType.DEGREE_CERTIFICATE].filter(
    (t) => profile.documents.some((d) => d.type === t),
  ).length;
  return Math.round(((base + requiredDocs) / 12) * 100);
}

export async function getMe(userId: string) {
  const profile = await ensureProfile(userId);
  return { profile, completion: completion(profile) };
}

function editableStatus(status: DoctorVerificationStatus): boolean {
  return status === DoctorVerificationStatus.DRAFT || status === DoctorVerificationStatus.REJECTED;
}

export async function updateMe(userId: string, dto: UpdateProfileInput, auditCtx: AuditContext) {
  const profile = await ensureProfile(userId);
  if (!editableStatus(profile.verificationStatus)) {
    throw new ForbiddenError(
      'Profile details are locked while verification is in progress or approved. Contact support for regulated profile changes.',
    );
  }

  const data: Prisma.DoctorProfileUpdateInput = { ...dto };
  if ((dto.firstName !== undefined || dto.lastName !== undefined) && profile.slug.startsWith('doctor-')) {
    data.slug = await uniqueSlug(dto.firstName ?? profile.firstName, dto.lastName ?? profile.lastName, userId);
  }
  // Re-editing a rejected application resets it to draft (docs/DECISIONS.md D3).
  if (profile.verificationStatus === DoctorVerificationStatus.REJECTED) {
    data.verificationStatus = DoctorVerificationStatus.DRAFT;
    data.rejectionReason = null;
    data.reviewedAt = null;
    data.reviewedByUserId = null;
  }

  try {
    const updated = await prisma.doctorProfile.update({ where: { id: profile.id }, data, include: privateInclude() });
    await recordAuditEvent(auditCtx, {
      eventType: 'DOCTOR_PROFILE',
      action: 'UPDATE',
      resourceType: 'DoctorProfile',
      resourceId: profile.id,
      metadata: { fields: Object.keys(dto) },
    });
    return { profile: updated, completion: completion(updated) };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new BadRequestError('This practitioner registration is already associated with another ABIES account');
    }
    throw error;
  }
}

export interface UploadedFile {
  originalName: string;
  mimeType: string;
  size: number;
  buffer: Buffer;
}

export async function addDocument(
  userId: string,
  type: DoctorDocumentType,
  file: UploadedFile,
  auditCtx: AuditContext,
) {
  const profile = await ensureProfile(userId);
  if (!editableStatus(profile.verificationStatus)) {
    throw new ForbiddenError('Documents can be changed only while the application is in Draft or Rejected state');
  }
  assertUploadAllowed({ mimetype: file.mimeType, size: file.size });

  const storedName = `${randomUUID()}-${file.originalName.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
  const storagePath = `doctor-documents/${profile.id}/${storedName}`;
  await putObject({ key: storagePath, body: file.buffer, contentType: file.mimeType });

  const document = await prisma.doctorDocument.create({
    data: {
      doctorProfileId: profile.id,
      type,
      originalName: file.originalName,
      storedName,
      mimeType: file.mimeType,
      sizeBytes: file.size,
      storagePath,
    },
  });

  await recordAuditEvent(auditCtx, {
    eventType: 'DOCTOR_PROFILE',
    action: 'DOCUMENT_UPLOAD',
    resourceType: 'DoctorDocument',
    resourceId: document.id,
    metadata: { type },
  });
  return document;
}

export async function listDocuments(userId: string) {
  const profile = await ensureProfile(userId);
  return prisma.doctorDocument.findMany({ where: { doctorProfileId: profile.id }, orderBy: { createdAt: 'desc' } });
}

async function documentForOwner(userId: string, id: string) {
  const profile = await ensureProfile(userId);
  const document = await prisma.doctorDocument.findFirst({ where: { id, doctorProfileId: profile.id } });
  if (!document) throw new NotFoundError('Document not found');
  return document;
}

export async function getDocumentDownloadUrl(userId: string, id: string): Promise<string> {
  const document = await documentForOwner(userId, id);
  return getSignedDownloadUrl(document.storagePath);
}

export async function removeDocument(userId: string, id: string, auditCtx: AuditContext) {
  const profile = await ensureProfile(userId);
  if (!editableStatus(profile.verificationStatus)) {
    throw new ForbiddenError('Documents cannot be removed while verification is in progress or approved');
  }
  const document = await documentForOwner(userId, id);
  await prisma.doctorDocument.delete({ where: { id } });
  await deleteObject(document.storagePath).catch(() => undefined);

  await recordAuditEvent(auditCtx, {
    eventType: 'DOCTOR_PROFILE',
    action: 'DOCUMENT_REMOVE',
    resourceType: 'DoctorDocument',
    resourceId: id,
  });
}

export async function addClinic(userId: string, dto: CreateClinicInput) {
  const profile = await ensureProfile(userId);
  return prisma.doctorClinic.create({ data: { doctorProfileId: profile.id, ...dto } });
}

export async function updateClinic(userId: string, id: string, dto: UpdateClinicInput) {
  const profile = await ensureProfile(userId);
  const clinic = await prisma.doctorClinic.findFirst({ where: { id, doctorProfileId: profile.id } });
  if (!clinic) throw new NotFoundError('Clinic not found');
  return prisma.doctorClinic.update({ where: { id }, data: dto });
}

export async function removeClinic(userId: string, id: string) {
  const profile = await ensureProfile(userId);
  const result = await prisma.doctorClinic.deleteMany({ where: { id, doctorProfileId: profile.id } });
  if (!result.count) throw new NotFoundError('Clinic not found');
}

export async function addAvailability(userId: string, dto: CreateAvailabilityInput) {
  if (dto.startTime >= dto.endTime) throw new BadRequestError('End time must be after start time');
  const profile = await ensureProfile(userId);
  if (!profile.consultationModes.includes(dto.mode)) {
    throw new BadRequestError(`Enable ${dto.mode} consultation mode on your profile first`);
  }
  return prisma.doctorAvailability.create({ data: { doctorProfileId: profile.id, ...dto } });
}

export async function updateAvailability(userId: string, id: string, dto: UpdateAvailabilityInput) {
  const profile = await ensureProfile(userId);
  const slot = await prisma.doctorAvailability.findFirst({ where: { id, doctorProfileId: profile.id } });
  if (!slot) throw new NotFoundError('Availability slot not found');
  const start = dto.startTime ?? slot.startTime;
  const end = dto.endTime ?? slot.endTime;
  if (start >= end) throw new BadRequestError('End time must be after start time');
  if (dto.mode && !profile.consultationModes.includes(dto.mode)) {
    throw new BadRequestError(`Enable ${dto.mode} consultation mode on your profile first`);
  }
  return prisma.doctorAvailability.update({ where: { id }, data: dto });
}

export async function removeAvailability(userId: string, id: string) {
  const profile = await ensureProfile(userId);
  const result = await prisma.doctorAvailability.deleteMany({ where: { id, doctorProfileId: profile.id } });
  if (!result.count) throw new NotFoundError('Availability slot not found');
}

export async function submit(userId: string, declarationAccepted: boolean, auditCtx: AuditContext) {
  if (!declarationAccepted) throw new BadRequestError('The practitioner declaration must be accepted');
  const profile = await ensureProfile(userId);
  if (!editableStatus(profile.verificationStatus)) {
    throw new BadRequestError('Application is not in a submittable state');
  }

  const missing: string[] = [];
  if (!profile.firstName) missing.push('first name');
  if (!profile.lastName) missing.push('last name');
  if (!profile.registrationCouncil) missing.push('registration council');
  if (!profile.registrationNumber) missing.push('registration number');
  if (!profile.primaryQualification) missing.push('primary qualification');
  if (profile.yearsExperience === null || profile.yearsExperience === undefined) missing.push('years of experience');
  if (!profile.specialties.length) missing.push('at least one speciality');
  if (!profile.languages.length) missing.push('at least one language');
  if (!profile.consultationModes.length) missing.push('consultation mode');
  if (profile.consultationModes.includes(ConsultationMode.VIDEO) && profile.videoFee === null) {
    missing.push('video consultation fee');
  }
  if (profile.consultationModes.includes(ConsultationMode.CLINIC) && profile.clinicFee === null) {
    missing.push('clinic consultation fee');
  }

  const documents = await prisma.doctorDocument.findMany({ where: { doctorProfileId: profile.id } });
  if (!documents.some((d) => d.type === DoctorDocumentType.REGISTRATION_CERTIFICATE)) {
    missing.push('registration certificate');
  }
  if (!documents.some((d) => d.type === DoctorDocumentType.DEGREE_CERTIFICATE)) {
    missing.push('degree certificate');
  }
  if (missing.length) throw new BadRequestError(`Complete the application before submission: ${missing.join(', ')}`);

  const updated = await prisma.doctorProfile.update({
    where: { id: profile.id },
    data: {
      verificationStatus: DoctorVerificationStatus.SUBMITTED,
      submittedAt: new Date(),
      rejectionReason: null,
      isDiscoverable: false,
    },
    include: privateInclude(),
  });

  await recordAuditEvent(auditCtx, {
    eventType: 'DOCTOR_PROFILE',
    action: 'SUBMIT',
    resourceType: 'DoctorProfile',
    resourceId: profile.id,
  });
  return { profile: updated, message: 'Application submitted for ABIES verification' };
}

function publicDoctor(d: Prisma.DoctorProfileGetPayload<{ include: { clinics: true; availability: true } }>) {
  const fullName = [d.title || 'Dr.', d.firstName, d.lastName].filter(Boolean).join(' ');
  const modes = d.consultationModes;
  const fees = [
    modes.includes(ConsultationMode.VIDEO) ? d.videoFee : null,
    modes.includes(ConsultationMode.CLINIC) ? d.clinicFee : null,
  ].filter((x): x is number => x !== null && x !== undefined);

  return {
    id: d.id,
    slug: d.slug,
    name: fullName,
    firstName: d.firstName,
    lastName: d.lastName,
    bio: d.bio,
    registrationCouncil: d.registrationCouncil,
    registrationNumber: d.registrationNumber,
    primaryQualification: d.primaryQualification,
    highestQualification: d.highestQualification,
    yearsExperience: d.yearsExperience,
    specialties: d.specialties,
    languages: d.languages,
    consultationModes: d.consultationModes,
    videoFee: d.videoFee,
    clinicFee: d.clinicFee,
    startingFee: fees.length ? Math.min(...fees) : null,
    rating: d.rating,
    reviewCount: d.reviewCount,
    clinics: d.clinics,
    availability: d.availability,
    verified: true,
    acceptingNewPatients: d.isAcceptingNewPatients,
  };
}

export interface PublicSearchQuery {
  q?: string;
  city?: string;
  specialty?: string;
  language?: string;
  mode?: ConsultationMode;
  accepting?: 'true' | 'false';
  limit?: number;
  offset?: number;
}

// Trust rule (docs/DECISIONS.md D3): a doctor is returned by the public API
// only when verificationStatus=APPROVED AND isDiscoverable=true.
export async function searchPublic(query: PublicSearchQuery) {
  const take = query.limit ?? 24;
  const skip = query.offset ?? 0;

  const where: Prisma.DoctorProfileWhereInput = {
    verificationStatus: DoctorVerificationStatus.APPROVED,
    isDiscoverable: true,
    isAcceptingNewPatients: query.accepting === 'false' ? undefined : true,
  };
  if (query.city) where.clinics = { some: { active: true, city: { contains: query.city, mode: 'insensitive' } } };
  if (query.language) where.languages = { has: query.language };
  if (query.specialty) where.specialties = { has: query.specialty };
  if (query.mode) where.consultationModes = { has: query.mode };
  if (query.q) {
    // Match each word of the query against at least one field, rather than
    // the whole query string against one field at a time — otherwise a
    // natural "First Last" name search never matches, since neither
    // firstName nor lastName alone contains the full two-word string.
    const words = query.q.trim().split(/\s+/).filter(Boolean);
    const fieldsForWord = (word: string): Prisma.DoctorProfileWhereInput[] => [
      { firstName: { contains: word, mode: 'insensitive' } },
      { lastName: { contains: word, mode: 'insensitive' } },
      { primaryQualification: { contains: word, mode: 'insensitive' } },
      { highestQualification: { contains: word, mode: 'insensitive' } },
      { bio: { contains: word, mode: 'insensitive' } },
    ];
    where.AND = words.map((word) => ({ OR: fieldsForWord(word) }));
  }

  const [total, rows] = await prisma.$transaction([
    prisma.doctorProfile.count({ where }),
    prisma.doctorProfile.findMany({
      where,
      skip,
      take,
      orderBy: [{ rating: 'desc' }, { yearsExperience: 'desc' }, { createdAt: 'asc' }],
      include: {
        clinics: { where: { active: true }, orderBy: { createdAt: 'asc' } },
        availability: { where: { active: true }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
      },
    }),
  ]);

  return { total, offset: skip, limit: take, doctors: rows.map(publicDoctor) };
}

export async function publicProfile(slug: string) {
  const doctor = await prisma.doctorProfile.findFirst({
    where: { slug, verificationStatus: DoctorVerificationStatus.APPROVED, isDiscoverable: true },
    include: {
      clinics: { where: { active: true }, orderBy: { createdAt: 'asc' } },
      availability: { where: { active: true }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
    },
  });
  if (!doctor) throw new NotFoundError('Doctor not found');
  return { doctor: publicDoctor(doctor) };
}

export async function facets() {
  const doctors = await prisma.doctorProfile.findMany({
    where: { verificationStatus: DoctorVerificationStatus.APPROVED, isDiscoverable: true },
    select: { specialties: true, languages: true, clinics: { where: { active: true }, select: { city: true } } },
  });
  const uniq = (xs: string[]) => [...new Set(xs.filter(Boolean))].sort((a, b) => a.localeCompare(b));
  return {
    specialties: uniq(doctors.flatMap((d) => d.specialties)),
    languages: uniq(doctors.flatMap((d) => d.languages)),
    cities: uniq(doctors.flatMap((d) => d.clinics.map((c) => c.city))),
  };
}
