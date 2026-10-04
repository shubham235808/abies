import { randomUUID } from 'crypto';
import { ConsultationMode, DoctorDocumentStatus, DoctorDocumentType, DoctorVerificationStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/db';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { assertUploadAllowed, deleteObject, getSignedDownloadUrl, putObject } from '../../lib/storage';
import { recordAuditEvent } from '../../server/audit';
import type { AuditContext } from '../../server/audit';
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

function slugBase(firstName?: string | null, lastName?: string | null, userId?: string): string {
  return [slugPart(firstName), slugPart(lastName)].filter(Boolean).join('-') || `doctor-${String(userId || '').slice(-6)}`;
}

// A check-then-act race: two doctors saving the same name at the same
// moment can both see "asha-rao" as free and both try to claim it. The
// findUnique loop here is just an optimization for the common case (a
// clean, human-readable slug without a suffix); the actual safety comes
// from the DB's unique constraint plus updateMe()'s retry loop below,
// which falls back to a random suffix (uniqueSlugCandidate) on conflict
// instead of re-running this same racy check.
async function uniqueSlug(firstName?: string | null, lastName?: string | null, userId?: string): Promise<string> {
  const base = slugBase(firstName, lastName, userId);
  let slug = base;
  let n = 2;
  while (await prisma.doctorProfile.findUnique({ where: { slug } })) slug = `${base}-${n++}`;
  return slug;
}

function uniqueSlugCandidate(firstName?: string | null, lastName?: string | null, userId?: string): string {
  return `${slugBase(firstName, lastName, userId)}-${randomUUID().slice(0, 6)}`;
}

// P2002's `meta` shape differs by Prisma engine. The classic query engine
// reports `meta.target: string[]` (column names) — but this project uses
// Prisma 7 driver adapters (docs/DECISIONS.md D7, @prisma/adapter-pg),
// which instead wrap the raw pg error as
// `meta.driverAdapterError.cause.constraint.index` (the constraint name,
// e.g. "DoctorProfile_slug_key"). Checked both so this doesn't silently
// stop working if the engine mode ever changes back.
function isUniqueConstraintOn(error: unknown, field: string): boolean {
  if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') return false;
  const meta = error.meta as Record<string, unknown> | undefined;
  const target = meta?.target;
  if (Array.isArray(target) && target.includes(field)) return true;
  if (typeof target === 'string' && target.toLowerCase().includes(field.toLowerCase())) return true;
  const driverAdapterError = meta?.driverAdapterError as { cause?: { constraint?: { index?: string } } } | undefined;
  const index = driverAdapterError?.cause?.constraint?.index;
  return typeof index === 'string' && index.toLowerCase().includes(field.toLowerCase());
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

// ENTERPRISE-5 — closes the loop on the admin's new REQUEST_RESUBMISSION
// document-review outcome: without this, an admin could flag a document
// for resubmission while the profile is SUBMITTED/UNDER_REVIEW, and the
// doctor would have no way to act on it (documents are otherwise locked
// outside DRAFT/REJECTED). Scoped to "any flagged document currently
// exists" rather than per-type — the doctor should upload the corrected
// copy first (the flagged original stays as an audit trail, same
// "supersede, don't delete" pattern Prescription corrections already use
// elsewhere in this codebase), and may then remove the flagged original
// too since it's still present at that point. Removing the flagged copy
// first would re-lock editing before a replacement could be added, since
// this check is evaluated fresh on every call rather than cached per
// session.
async function documentsEditable(profile: { id: string; verificationStatus: DoctorVerificationStatus }): Promise<boolean> {
  if (editableStatus(profile.verificationStatus)) return true;
  const flagged = await prisma.doctorDocument.count({
    where: { doctorProfileId: profile.id, status: DoctorDocumentStatus.RESUBMISSION_REQUIRED },
  });
  return flagged > 0;
}

export async function updateMe(userId: string, dto: UpdateProfileInput, auditCtx: AuditContext) {
  const profile = await ensureProfile(userId);
  if (!editableStatus(profile.verificationStatus)) {
    throw new ForbiddenError(
      'Profile details are locked while verification is in progress or approved. Contact support for regulated profile changes.',
    );
  }

  const wantsSlugUpdate = (dto.firstName !== undefined || dto.lastName !== undefined) && profile.slug.startsWith('doctor-');
  const firstName = dto.firstName ?? profile.firstName;
  const lastName = dto.lastName ?? profile.lastName;

  const data: Prisma.DoctorProfileUpdateInput = { ...dto };
  if (wantsSlugUpdate) {
    data.slug = await uniqueSlug(firstName, lastName, userId);
  }
  // Re-editing a rejected application resets it to draft (docs/DECISIONS.md D3).
  if (profile.verificationStatus === DoctorVerificationStatus.REJECTED) {
    data.verificationStatus = DoctorVerificationStatus.DRAFT;
    data.rejectionReason = null;
    data.reviewedAt = null;
    data.reviewedByUserId = null;
  }

  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
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
      // Two profiles saving the same name at the same moment can both pass
      // uniqueSlug()'s check-then-act pre-check (see its comment) — that's
      // a real race, not corruption, so retry with a fresh random-suffixed
      // candidate instead of surfacing a confusing error to whoever loses it.
      if (wantsSlugUpdate && isUniqueConstraintOn(error, 'slug') && attempt < maxAttempts) {
        data.slug = uniqueSlugCandidate(firstName, lastName, userId);
        continue;
      }
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new BadRequestError('This practitioner registration is already associated with another ABIES account');
      }
      throw error;
    }
  }
  throw new Error('Could not allocate a unique profile slug after multiple attempts');
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
  // PROFILE_PHOTO is marketing/display content, not a credential document
  // the verification-lock exists to protect — unlike a registration
  // certificate, a doctor needs to be able to update their photo at any
  // time, including once already APPROVED (the normal, permanent state
  // for a live doctor). Public display still requires admin re-VERIFICATION
  // of the new upload (modules/doctors/doctors.service.ts's PUBLIC_PHOTO_INCLUDE),
  // so this doesn't skip moderation, only the credential-editability lock.
  if (type !== DoctorDocumentType.PROFILE_PHOTO && !(await documentsEditable(profile))) {
    throw new ForbiddenError('Documents can be changed only while the application is in Draft or Rejected state, or a document has been flagged for resubmission');
  }
  assertUploadAllowed({ mimetype: file.mimeType, size: file.size, buffer: file.buffer });

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
  const document = await documentForOwner(userId, id);
  if (document.type !== DoctorDocumentType.PROFILE_PHOTO && !(await documentsEditable(profile))) {
    throw new ForbiddenError('Documents cannot be removed while verification is in progress or approved');
  }
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

async function ownedClinicId(doctorProfileId: string, clinicId: string): Promise<string> {
  const clinic = await prisma.doctorClinic.findFirst({ where: { id: clinicId, doctorProfileId } });
  if (!clinic) throw new BadRequestError('Clinic not found');
  return clinic.id;
}

export async function addAvailability(userId: string, dto: CreateAvailabilityInput) {
  if (dto.startTime >= dto.endTime) throw new BadRequestError('End time must be after start time');
  const profile = await ensureProfile(userId);
  if (!profile.consultationModes.includes(dto.mode)) {
    throw new BadRequestError(`Enable ${dto.mode} consultation mode on your profile first`);
  }
  if (dto.mode === 'CLINIC') {
    if (!dto.clinicId) throw new BadRequestError('Select a clinic for a clinic-mode availability window');
    await ownedClinicId(profile.id, dto.clinicId);
  }
  return prisma.doctorAvailability.create({
    data: { ...dto, doctorProfileId: profile.id, clinicId: dto.mode === 'CLINIC' ? dto.clinicId : undefined },
  });
}

export async function updateAvailability(userId: string, id: string, dto: UpdateAvailabilityInput) {
  const profile = await ensureProfile(userId);
  const slot = await prisma.doctorAvailability.findFirst({ where: { id, doctorProfileId: profile.id } });
  if (!slot) throw new NotFoundError('Availability slot not found');
  const start = dto.startTime ?? slot.startTime;
  const end = dto.endTime ?? slot.endTime;
  if (start >= end) throw new BadRequestError('End time must be after start time');
  const mode = dto.mode ?? slot.mode;
  if (dto.mode && !profile.consultationModes.includes(dto.mode)) {
    throw new BadRequestError(`Enable ${dto.mode} consultation mode on your profile first`);
  }
  if (mode === 'CLINIC') {
    const clinicId = dto.clinicId ?? slot.clinicId;
    if (!clinicId) throw new BadRequestError('Select a clinic for a clinic-mode availability window');
    await ownedClinicId(profile.id, clinicId);
    return prisma.doctorAvailability.update({ where: { id }, data: { ...dto, clinicId } });
  }
  return prisma.doctorAvailability.update({ where: { id }, data: { ...dto, clinicId: null } });
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

const PUBLIC_PHOTO_INCLUDE = {
  where: { type: DoctorDocumentType.PROFILE_PHOTO, status: DoctorDocumentStatus.VERIFIED },
  take: 1,
  orderBy: { createdAt: 'desc' as const },
} satisfies Prisma.DoctorDocumentFindManyArgs;

function publicDoctor(
  d: Prisma.DoctorProfileGetPayload<{ include: { clinics: true; availability: true; documents: typeof PUBLIC_PHOTO_INCLUDE } }>,
  patientLanguages?: string[],
) {
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
    // EXPANSION-1d — a doctor's PROFILE_PHOTO document (already an
    // existing upload type, previously write-only: uploaded but never
    // surfaced publicly) is shown once an admin has VERIFIED it, the
    // same trust gate already used for the profile's own discoverability
    // — never an unreviewed upload shown to anonymous visitors.
    photoUrl: d.documents.length > 0 ? `/api/v1/public/doctors/${d.slug}/photo` : null,
    clinics: d.clinics,
    availability: d.availability,
    verified: true,
    acceptingNewPatients: d.isAcceptingNewPatients,
    // docs/ENTERPRISE-GAP-ANALYSIS.md §4 — set only when the caller passed
    // the viewing patient's own languages, so a card can show "Speaks your
    // language" without the ranking itself leaking into the public API
    // shape for anonymous/no-preference callers.
    languageMatch: patientLanguages?.length ? d.languages.some((l) => patientLanguages.includes(l)) : undefined,
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
  // docs/ENTERPRISE-GAP-ANALYSIS.md §4's language-matching engine: ranks
  // (never hides) doctors sharing at least one language with the patient.
  // Deliberately separate from `language` above — that's an explicit,
  // patient-chosen filter (only matching doctors returned at all);
  // this is a soft ranking signal over the patient's own profile.
  patientLanguages?: string[];
}

// Ranking result cap — full-result-set ranking needs the whole matching
// set in memory before pagination (Prisma can't express "boost rows
// sharing an array value" in orderBy without raw SQL), same practical
// scale ceiling as modules/support/tickets.service.ts's listQueue and
// modules/partners/leads.service.ts's listLeads.
const RANKING_POOL_SIZE = 500;

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

  const dbOrderBy: Prisma.DoctorProfileOrderByWithRelationInput[] = [
    { rating: 'desc' },
    { yearsExperience: 'desc' },
    { createdAt: 'asc' },
  ];
  // No explicit `language` filter (which already guarantees every result
  // shares that language — nothing left to rank by) and a patient with
  // known languages: rank matches first over the whole result set, then
  // paginate — never filters non-matching doctors out, per the brief's
  // explicit "do NOT completely hide other doctors" instruction.
  const needsLanguageRanking = !query.language && (query.patientLanguages?.length ?? 0) > 0;

  if (!needsLanguageRanking) {
    const [total, rows] = await prisma.$transaction([
      prisma.doctorProfile.count({ where }),
      prisma.doctorProfile.findMany({
        where,
        skip,
        take,
        orderBy: dbOrderBy,
        include: {
          clinics: { where: { active: true }, orderBy: { createdAt: 'asc' } },
          availability: { where: { active: true }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
          documents: PUBLIC_PHOTO_INCLUDE,
        },
      }),
    ]);
    return { total, offset: skip, limit: take, doctors: rows.map((d) => publicDoctor(d, query.patientLanguages)) };
  }

  const [total, pool] = await prisma.$transaction([
    prisma.doctorProfile.count({ where }),
    prisma.doctorProfile.findMany({
      where,
      take: RANKING_POOL_SIZE,
      orderBy: dbOrderBy,
      include: {
        clinics: { where: { active: true }, orderBy: { createdAt: 'asc' } },
        availability: { where: { active: true }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
        documents: PUBLIC_PHOTO_INCLUDE,
      },
    }),
  ]);
  const patientLanguages = query.patientLanguages!;
  const ranked = [...pool].sort((a, b) => {
    const aMatch = a.languages.some((l) => patientLanguages.includes(l)) ? 1 : 0;
    const bMatch = b.languages.some((l) => patientLanguages.includes(l)) ? 1 : 0;
    return bMatch - aMatch; // Array.sort is stable — ties keep the DB's rating/experience order.
  });

  return {
    total,
    offset: skip,
    limit: take,
    doctors: ranked.slice(skip, skip + take).map((d) => publicDoctor(d, patientLanguages)),
  };
}

export async function publicProfile(slug: string) {
  const doctor = await prisma.doctorProfile.findFirst({
    where: { slug, verificationStatus: DoctorVerificationStatus.APPROVED, isDiscoverable: true },
    include: {
      clinics: { where: { active: true }, orderBy: { createdAt: 'asc' } },
      availability: { where: { active: true }, orderBy: [{ dayOfWeek: 'asc' }, { startTime: 'asc' }] },
      documents: PUBLIC_PHOTO_INCLUDE,
    },
  });
  if (!doctor) throw new NotFoundError('Doctor not found');
  return { doctor: publicDoctor(doctor) };
}

// Resolves the actual signed download URL for a doctor's public photo, so
// the redirect route can stay a thin two-line handler. Same VERIFIED-only
// gate as publicDoctor()'s photoUrl flag.
export async function publicPhotoDownloadUrl(slug: string): Promise<string> {
  const doctor = await prisma.doctorProfile.findFirst({
    where: { slug, verificationStatus: DoctorVerificationStatus.APPROVED, isDiscoverable: true },
    select: { documents: PUBLIC_PHOTO_INCLUDE },
  });
  const photo = doctor?.documents[0];
  if (!photo) throw new NotFoundError('Photo not found');
  return getSignedDownloadUrl(photo.storagePath);
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
