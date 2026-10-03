import { prisma } from '../../lib/db';
import { ConflictError, NotFoundError } from '../../lib/errors';
import { recordAuditEvent } from '../../server/audit';
import type { AuditContext } from '../../server/audit';
import type { createBedSchema, createFacilitySchema, createWardSchema, updateBedSchema, updateFacilitySchema, updateWardSchema } from './hospital.schemas';
import type { z } from 'zod';

// ---- Facilities ----

export async function listFacilities() {
  return prisma.hospitalFacility.findMany({
    include: { _count: { select: { wards: true } } },
    orderBy: { name: 'asc' },
  });
}

export async function getFacility(id: string) {
  const facility = await prisma.hospitalFacility.findUnique({
    where: { id },
    include: { wards: { include: { _count: { select: { beds: true } } }, orderBy: { name: 'asc' } } },
  });
  if (!facility) throw new NotFoundError('Facility not found');
  return facility;
}

export async function createFacility(dto: z.infer<typeof createFacilitySchema>, auditCtx: AuditContext) {
  const facility = await prisma.hospitalFacility.create({ data: dto });
  await recordAuditEvent(auditCtx, { eventType: 'HOSPITAL', action: 'FACILITY_CREATED', resourceType: 'HospitalFacility', resourceId: facility.id });
  return facility;
}

export async function updateFacility(id: string, dto: z.infer<typeof updateFacilitySchema>, auditCtx: AuditContext) {
  const existing = await prisma.hospitalFacility.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Facility not found');
  const facility = await prisma.hospitalFacility.update({ where: { id }, data: dto });
  await recordAuditEvent(auditCtx, { eventType: 'HOSPITAL', action: 'FACILITY_UPDATED', resourceType: 'HospitalFacility', resourceId: id, metadata: { fields: Object.keys(dto) } });
  return facility;
}

// ---- Wards ----

export async function getWard(id: string) {
  const ward = await prisma.hospitalWard.findUnique({
    where: { id },
    include: { facility: { select: { id: true, name: true } }, beds: { orderBy: { label: 'asc' } } },
  });
  if (!ward) throw new NotFoundError('Ward not found');
  return ward;
}

export async function createWard(facilityId: string, dto: z.infer<typeof createWardSchema>, auditCtx: AuditContext) {
  const facility = await prisma.hospitalFacility.findUnique({ where: { id: facilityId } });
  if (!facility) throw new NotFoundError('Facility not found');
  const ward = await prisma.hospitalWard.create({ data: { facilityId, ...dto } });
  await recordAuditEvent(auditCtx, { eventType: 'HOSPITAL', action: 'WARD_CREATED', resourceType: 'HospitalWard', resourceId: ward.id, metadata: { facilityId } });
  return ward;
}

export async function updateWard(id: string, dto: z.infer<typeof updateWardSchema>, auditCtx: AuditContext) {
  const existing = await prisma.hospitalWard.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Ward not found');
  const ward = await prisma.hospitalWard.update({ where: { id }, data: dto });
  await recordAuditEvent(auditCtx, { eventType: 'HOSPITAL', action: 'WARD_UPDATED', resourceType: 'HospitalWard', resourceId: id, metadata: { fields: Object.keys(dto) } });
  return ward;
}

// ---- Beds ----

export async function createBed(wardId: string, dto: z.infer<typeof createBedSchema>, auditCtx: AuditContext) {
  const ward = await prisma.hospitalWard.findUnique({ where: { id: wardId } });
  if (!ward) throw new NotFoundError('Ward not found');
  const existing = await prisma.hospitalBed.findUnique({ where: { wardId_label: { wardId, label: dto.label } } });
  if (existing) throw new ConflictError('A bed with this label already exists in this ward');
  const bed = await prisma.hospitalBed.create({ data: { wardId, label: dto.label } });
  await recordAuditEvent(auditCtx, { eventType: 'HOSPITAL', action: 'BED_CREATED', resourceType: 'HospitalBed', resourceId: bed.id, metadata: { wardId } });
  return bed;
}

export async function updateBed(id: string, dto: z.infer<typeof updateBedSchema>, auditCtx: AuditContext) {
  const existing = await prisma.hospitalBed.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Bed not found');
  if (existing.status === 'OCCUPIED' && dto.status) {
    throw new ConflictError('An occupied bed is managed by its admission — discharge or transfer the patient first');
  }
  const bed = await prisma.hospitalBed.update({ where: { id }, data: dto });
  await recordAuditEvent(auditCtx, { eventType: 'HOSPITAL', action: 'BED_UPDATED', resourceType: 'HospitalBed', resourceId: id, metadata: { fields: Object.keys(dto) } });
  return bed;
}

// Admit-patient form's doctor picker — same "no search UI exists, just an
// approved-only option list" precedent as settlement's listPartnerOptions.
export async function listApprovedDoctorOptions() {
  const doctors = await prisma.doctorProfile.findMany({
    where: { verificationStatus: 'APPROVED' },
    select: { id: true, firstName: true, lastName: true },
    orderBy: { firstName: 'asc' },
  });
  return doctors.map((d) => ({ id: d.id, name: `${d.firstName} ${d.lastName}` }));
}

// Admission-board data: every bed, grouped implicitly by its ward/facility,
// with its current (if any) admission and patient — this is what the admit/
// transfer/discharge actions operate against.
export async function admissionBoard() {
  const facilities = await prisma.hospitalFacility.findMany({
    where: { active: true },
    include: {
      wards: {
        where: { active: true },
        include: {
          beds: {
            include: {
              admissions: {
                where: { status: 'ADMITTED' },
                include: {
                  patientUser: { select: { mobile: true, patientProfile: { select: { firstName: true, lastName: true } } } },
                  admittingDoctor: { select: { firstName: true, lastName: true } },
                },
              },
            },
            orderBy: { label: 'asc' },
          },
        },
        orderBy: { name: 'asc' },
      },
    },
    orderBy: { name: 'asc' },
  });
  return facilities;
}
