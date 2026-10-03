import { PharmacyVerificationStatus } from '@prisma/client';
import { prisma } from '../../lib/db';
import { BadRequestError, ForbiddenError, NotFoundError } from '../../lib/errors';
import { recordAuditEvent } from '../../server/audit';
import type { AuditContext } from '../../server/audit';
import type { taxSettingsSchema, updatePharmacyProfileSchema } from './pharmacies.schemas';
import type { z } from 'zod';

type UpdatePharmacyProfileInput = z.infer<typeof updatePharmacyProfileSchema>;
type TaxSettingsInput = z.infer<typeof taxSettingsSchema>;

function editableStatus(status: PharmacyVerificationStatus): boolean {
  return status === PharmacyVerificationStatus.DRAFT || status === PharmacyVerificationStatus.REJECTED;
}

export async function ensurePharmacyProfile(userId: string) {
  const existing = await prisma.pharmacy.findUnique({ where: { userId } });
  if (existing) return existing;
  return prisma.pharmacy.create({ data: { userId } });
}

export async function getMyPharmacy(userId: string) {
  const pharmacy = await ensurePharmacyProfile(userId);
  return { pharmacy };
}

export async function updateMyPharmacy(userId: string, dto: UpdatePharmacyProfileInput, auditCtx: AuditContext) {
  const pharmacy = await ensurePharmacyProfile(userId);
  if (!editableStatus(pharmacy.verificationStatus)) {
    throw new ForbiddenError('Pharmacy details are locked while verification is in progress or approved. Contact support for regulated changes.');
  }
  const updated = await prisma.pharmacy.update({
    where: { id: pharmacy.id },
    data: dto,
  });
  await recordAuditEvent(auditCtx, {
    eventType: 'PHARMACY',
    action: 'UPDATE',
    resourceType: 'Pharmacy',
    resourceId: pharmacy.id,
    metadata: { fields: Object.keys(dto) },
  });
  return { pharmacy: updated };
}

export async function submitPharmacy(userId: string, declarationAccepted: boolean, auditCtx: AuditContext) {
  if (!declarationAccepted) throw new BadRequestError('The partner declaration must be accepted');
  const pharmacy = await ensurePharmacyProfile(userId);
  if (!editableStatus(pharmacy.verificationStatus)) {
    throw new BadRequestError('Application is not in a submittable state');
  }

  const missing: string[] = [];
  if (!pharmacy.name) missing.push('pharmacy name');
  if (!pharmacy.licenseNumbers.length) missing.push('at least one license number');
  if (!pharmacy.serviceAreas.length) missing.push('at least one service area');
  if (missing.length) throw new BadRequestError(`Complete the following before submitting: ${missing.join(', ')}`);

  const updated = await prisma.pharmacy.update({
    where: { id: pharmacy.id },
    data: { verificationStatus: PharmacyVerificationStatus.SUBMITTED, submittedAt: new Date(), rejectionReason: null },
  });
  await recordAuditEvent(auditCtx, {
    eventType: 'PHARMACY_VERIFICATION',
    action: 'SUBMIT',
    resourceType: 'Pharmacy',
    resourceId: pharmacy.id,
  });
  return { pharmacy: updated };
}

// Powers the pharmacy-picker in the "order from a finalized prescription"
// flow (src/app/patient/medicines) — a patient chooses which approved
// pharmacy to route their order to before matchPrescriptionAtPharmacy
// checks what that pharmacy actually stocks.
export async function listApprovedPharmacies(area?: string) {
  return prisma.pharmacy.findMany({
    where: {
      verificationStatus: PharmacyVerificationStatus.APPROVED,
      active: true,
      ...(area ? { serviceAreas: { has: area } } : {}),
    },
    select: { id: true, name: true, serviceAreas: true },
    orderBy: { name: 'asc' },
  });
}

export async function requireApprovedPharmacy(userId: string) {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { userId } });
  if (!pharmacy || pharmacy.verificationStatus !== PharmacyVerificationStatus.APPROVED) {
    throw new NotFoundError('Pharmacy profile not found or not approved');
  }
  return pharmacy;
}

// ENTERPRISE-7 — the pharmacy's own GST registration profile. One row per
// pharmacy, upserted (a pharmacy either hasn't set this up yet or is
// editing what it already entered — never a list).
export async function getMyTaxSettings(userId: string) {
  const pharmacy = await ensurePharmacyProfile(userId);
  return prisma.taxSettings.findUnique({ where: { pharmacyId: pharmacy.id } });
}

export async function upsertMyTaxSettings(userId: string, dto: TaxSettingsInput, auditCtx: AuditContext) {
  const pharmacy = await requireApprovedPharmacy(userId);
  const settings = await prisma.taxSettings.upsert({
    where: { pharmacyId: pharmacy.id },
    create: { pharmacyId: pharmacy.id, ...dto },
    update: dto,
  });
  await recordAuditEvent(auditCtx, {
    eventType: 'PHARMACY',
    action: 'TAX_SETTINGS_UPDATED',
    resourceType: 'TaxSettings',
    resourceId: settings.id,
  });
  return settings;
}
