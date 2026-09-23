import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/db';
import { NotFoundError } from '@/lib/errors';
import { recordAuditEvent } from '@/server/audit';
import type { AuditContext } from '@/server/audit';
import type {
  createFamilyMemberSchema,
  updateFamilyMemberSchema,
  updatePatientProfileSchema,
} from './patients.schemas';
import type { z } from 'zod';

type UpdateProfileInput = z.infer<typeof updatePatientProfileSchema>;
type CreateFamilyInput = z.infer<typeof createFamilyMemberSchema>;
type UpdateFamilyInput = z.infer<typeof updateFamilyMemberSchema>;

export async function getMyProfile(userId: string) {
  const profile = await prisma.patientProfile.findUnique({
    where: { userId },
    include: { familyMembers: { orderBy: { createdAt: 'asc' } } },
  });
  if (!profile) throw new NotFoundError('Patient profile not found');
  const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
  return { profile, email: user.email, mobile: user.mobile };
}

export async function updateMyProfile(
  userId: string,
  dto: UpdateProfileInput,
  auditCtx: AuditContext,
) {
  const profile = await prisma.patientProfile.findUnique({ where: { userId } });
  if (!profile) throw new NotFoundError('Patient profile not found');

  if (dto.email !== undefined) {
    await prisma.user.update({ where: { id: userId }, data: { email: dto.email || null } });
  }

  const data: Prisma.PatientProfileUpdateInput = {
    firstName: dto.firstName,
    lastName: dto.lastName,
    gender: dto.gender,
    phone: dto.phone,
    address: dto.address,
    city: dto.city,
    state: dto.state,
    pin: dto.pin,
    preferredLanguage: dto.preferredLanguage,
    emergencyContact: dto.emergencyContact,
    allergies: dto.allergies,
    medicalHistory: dto.medicalHistory,
    dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
    consentPreferences: dto.consentPreferences as Prisma.InputJsonValue | undefined,
  };

  const updated = await prisma.patientProfile.update({
    where: { userId },
    data,
    include: { familyMembers: { orderBy: { createdAt: 'asc' } } },
  });

  // Audit that the profile changed and which fields — never the values
  // themselves (allergies/medicalHistory are PHI-adjacent; see
  // docs/SECURITY-MODEL.md "Audit" — metadata never contains PHI).
  await recordAuditEvent(auditCtx, {
    eventType: 'PATIENT_PROFILE',
    action: 'UPDATE',
    resourceType: 'PatientProfile',
    resourceId: profile.id,
    metadata: { fields: Object.keys(dto) },
  });

  return updated;
}

export async function listFamilyMembers(userId: string) {
  const profile = await prisma.patientProfile.findUnique({
    where: { userId },
    include: { familyMembers: { orderBy: { createdAt: 'asc' } } },
  });
  if (!profile) throw new NotFoundError('Patient profile not found');
  return profile.familyMembers;
}

export async function addFamilyMember(userId: string, dto: CreateFamilyInput, auditCtx: AuditContext) {
  const profile = await prisma.patientProfile.findUnique({ where: { userId } });
  if (!profile) throw new NotFoundError('Patient profile not found');

  const member = await prisma.familyMember.create({
    data: {
      patientProfileId: profile.id,
      name: dto.name,
      relation: dto.relation,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
      gender: dto.gender,
      mobile: dto.mobile,
    },
  });

  await recordAuditEvent(auditCtx, {
    eventType: 'PATIENT_PROFILE',
    action: 'FAMILY_MEMBER_ADD',
    resourceType: 'FamilyMember',
    resourceId: member.id,
  });
  return member;
}

// Ownership is enforced by scoping the lookup through the caller's own
// PatientProfile, never by trusting the family member id alone (same
// pattern as Sprint 3's profileForOwner — docs/DECISIONS.md D3).
async function ownedFamilyMember(userId: string, memberId: string) {
  const member = await prisma.familyMember.findFirst({
    where: { id: memberId, patientProfile: { userId } },
  });
  if (!member) throw new NotFoundError('Family member not found');
  return member;
}

export async function updateFamilyMember(
  userId: string,
  memberId: string,
  dto: UpdateFamilyInput,
  auditCtx: AuditContext,
) {
  await ownedFamilyMember(userId, memberId);
  const updated = await prisma.familyMember.update({
    where: { id: memberId },
    data: {
      ...dto,
      dateOfBirth: dto.dateOfBirth ? new Date(dto.dateOfBirth) : undefined,
    },
  });

  await recordAuditEvent(auditCtx, {
    eventType: 'PATIENT_PROFILE',
    action: 'FAMILY_MEMBER_UPDATE',
    resourceType: 'FamilyMember',
    resourceId: memberId,
  });
  return updated;
}

export async function removeFamilyMember(userId: string, memberId: string, auditCtx: AuditContext) {
  await ownedFamilyMember(userId, memberId);
  await prisma.familyMember.delete({ where: { id: memberId } });

  await recordAuditEvent(auditCtx, {
    eventType: 'PATIENT_PROFILE',
    action: 'FAMILY_MEMBER_REMOVE',
    resourceType: 'FamilyMember',
    resourceId: memberId,
  });
}
