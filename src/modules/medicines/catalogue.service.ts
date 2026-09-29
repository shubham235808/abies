import { prisma } from '@/lib/db';
import { BadRequestError, ConflictError, NotFoundError } from '@/lib/errors';
import { ensurePharmacyProfile } from './pharmacies.service';
import { recordStockMovement } from './stock-movements.service';
import type { addInventorySchema, publicMedicineSearchSchema, updateInventorySchema } from './catalogue.schemas';
import type { z } from 'zod';

type AddInventoryInput = z.infer<typeof addInventorySchema>;
type UpdateInventoryInput = z.infer<typeof updateInventorySchema>;
type PublicSearchQuery = z.infer<typeof publicMedicineSearchSchema>;

// Platform-wide catalogue, built lazily — find-by-name-or-create. Called
// both from modules/consultations/prescriptions.service.ts (finalizing a
// prescription resolves each item's free-text productName to a Medicine)
// and from addInventory below (a pharmacist stocking a new OTC item).
export async function resolveMedicineByName(
  name: string,
  extra?: {
    genericName?: string;
    form?: string;
    strength?: string;
    manufacturerName?: string;
    brandName?: string;
    requiresPrescription?: boolean;
    category?: string;
    hsnCode?: string;
  },
) {
  const trimmed = name.trim();
  const existing = await prisma.medicine.findFirst({ where: { name: { equals: trimmed, mode: 'insensitive' } } });
  if (existing) {
    // The first mention of a drug (often a bare prescription productName)
    // may be sparse — let a later, more complete mention (e.g. a pharmacist
    // stocking it) fill in gaps without clobbering fields already set.
    const fill: Record<string, string> = {};
    if (extra?.genericName && !existing.genericName) fill.genericName = extra.genericName;
    if (extra?.form && !existing.form) fill.form = extra.form;
    if (extra?.strength && !existing.strength) fill.strength = extra.strength;
    if (extra?.manufacturerName && !existing.manufacturerName) fill.manufacturerName = extra.manufacturerName;
    if (extra?.brandName && !existing.brandName) fill.brandName = extra.brandName;
    if (extra?.category && !existing.category) fill.category = extra.category;
    if (extra?.hsnCode && !existing.hsnCode) fill.hsnCode = extra.hsnCode;
    if (Object.keys(fill).length === 0) return existing;
    return prisma.medicine.update({ where: { id: existing.id }, data: fill });
  }
  return prisma.medicine.create({
    data: {
      name: trimmed,
      genericName: extra?.genericName,
      form: extra?.form,
      strength: extra?.strength,
      manufacturerName: extra?.manufacturerName,
      brandName: extra?.brandName,
      requiresPrescription: extra?.requiresPrescription ?? true,
      category: extra?.category,
      hsnCode: extra?.hsnCode,
    },
  });
}

export async function listMyInventory(userId: string) {
  const pharmacy = await ensurePharmacyProfile(userId);
  return prisma.pharmacyInventory.findMany({
    where: { pharmacyId: pharmacy.id },
    include: { medicine: true },
    orderBy: [{ medicine: { name: 'asc' } }, { expiryDate: 'asc' }],
  });
}

async function ownedInventoryRow(userId: string, inventoryId: string) {
  const pharmacy = await ensurePharmacyProfile(userId);
  const row = await prisma.pharmacyInventory.findFirst({ where: { id: inventoryId, pharmacyId: pharmacy.id } });
  if (!row) throw new NotFoundError('Inventory batch not found');
  return row;
}

export async function addInventory(userId: string, dto: AddInventoryInput) {
  const pharmacy = await ensurePharmacyProfile(userId);

  const expiryDate = new Date(dto.expiryDate);
  if (Number.isNaN(expiryDate.getTime()) || expiryDate.getTime() < Date.now()) {
    throw new BadRequestError('Expiry date must be in the future');
  }

  const medicine = dto.medicineId
    ? await prisma.medicine.findUnique({ where: { id: dto.medicineId } })
    : dto.name
      ? await resolveMedicineByName(dto.name, {
          genericName: dto.genericName,
          form: dto.form,
          strength: dto.strength,
          manufacturerName: dto.manufacturerName,
          brandName: dto.brandName,
          requiresPrescription: dto.requiresPrescription,
          category: dto.category,
          hsnCode: dto.hsnCode,
        })
      : null;
  if (!medicine) throw new BadRequestError('Provide either an existing medicineId or a name to catalogue a new one');

  const existingBatch = await prisma.pharmacyInventory.findUnique({
    where: { pharmacyId_medicineId_batchNumber: { pharmacyId: pharmacy.id, medicineId: medicine.id, batchNumber: dto.batchNumber } },
  });
  if (existingBatch) throw new ConflictError('You already have a batch with this number for this medicine');

  return prisma.$transaction(async (tx) => {
    const row = await tx.pharmacyInventory.create({
      data: {
        pharmacyId: pharmacy.id,
        medicineId: medicine.id,
        batchNumber: dto.batchNumber,
        expiryDate,
        quantityAvailable: dto.quantityAvailable,
        price: dto.price,
      },
      include: { medicine: true },
    });
    await recordStockMovement(tx, {
      pharmacyId: pharmacy.id,
      inventoryId: row.id,
      type: 'PURCHASE',
      quantityDelta: dto.quantityAvailable,
      actorUserId: userId,
      reason: 'Initial stock',
    });
    return row;
  });
}

export async function updateInventory(userId: string, inventoryId: string, dto: UpdateInventoryInput) {
  const row = await ownedInventoryRow(userId, inventoryId);
  return prisma.$transaction(async (tx) => {
    const updated = await tx.pharmacyInventory.update({
      where: { id: row.id },
      data: {
        quantityAvailable: dto.quantityAvailable,
        price: dto.price,
        expiryDate: dto.expiryDate ? new Date(dto.expiryDate) : undefined,
      },
      include: { medicine: true },
    });
    if (dto.quantityAvailable !== undefined && dto.quantityAvailable !== row.quantityAvailable) {
      await recordStockMovement(tx, {
        pharmacyId: row.pharmacyId,
        inventoryId: row.id,
        type: 'MANUAL_CORRECTION',
        quantityDelta: dto.quantityAvailable - row.quantityAvailable,
        actorUserId: userId,
        reason: 'Manual correction via inventory edit',
      });
    }
    return updated;
  });
}

export async function removeInventory(userId: string, inventoryId: string) {
  const row = await ownedInventoryRow(userId, inventoryId);
  await prisma.pharmacyInventory.delete({ where: { id: row.id } });
}

export interface PublicMedicineListing {
  medicineId: string;
  name: string;
  genericName: string | null;
  form: string | null;
  strength: string | null;
  brandName: string | null;
  imageUrl: string | null;
  pharmacy: { id: string; name: string | null; serviceAreas: string[] };
  quantityAvailable: number;
  price: number;
}

// OTC-only (requiresPrescription: false) — a prescribed medicine is ordered
// through modules/medicines/orders.service.ts's prescription-linked flow,
// not discovered here. One row per (pharmacy, medicine): quantity summed
// and price taken from the cheapest in-stock batch, same simplification
// diagnostics' catalogue.service.ts makes by not modelling per-batch detail
// in the public listing.
export async function searchPublic(query: PublicSearchQuery): Promise<{ total: number; medicines: PublicMedicineListing[] }> {
  const take = query.limit ?? 24;
  const skip = query.offset ?? 0;

  const rows = await prisma.pharmacyInventory.findMany({
    where: {
      quantityAvailable: { gt: 0 },
      medicine: {
        active: true,
        requiresPrescription: false,
        ...(query.q
          ? {
              OR: [
                { name: { contains: query.q, mode: 'insensitive' as const } },
                { genericName: { contains: query.q, mode: 'insensitive' as const } },
                { brandName: { contains: query.q, mode: 'insensitive' as const } },
              ],
            }
          : {}),
      },
      pharmacy: {
        verificationStatus: 'APPROVED',
        active: true,
        ...(query.area ? { serviceAreas: { has: query.area } } : {}),
      },
    },
    include: { medicine: true, pharmacy: { select: { id: true, name: true, serviceAreas: true } } },
    orderBy: { price: 'asc' },
  });

  const grouped = new Map<string, PublicMedicineListing>();
  for (const row of rows) {
    const key = `${row.pharmacyId}:${row.medicineId}`;
    const existing = grouped.get(key);
    if (existing) {
      existing.quantityAvailable += row.quantityAvailable;
      existing.price = Math.min(existing.price, row.price);
    } else {
      grouped.set(key, {
        medicineId: row.medicineId,
        name: row.medicine.name,
        genericName: row.medicine.genericName,
        form: row.medicine.form,
        strength: row.medicine.strength,
        brandName: row.medicine.brandName,
        imageUrl: row.medicine.imageUrl,
        pharmacy: row.pharmacy,
        quantityAvailable: row.quantityAvailable,
        price: row.price,
      });
    }
  }

  const all = [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name));
  return { total: all.length, medicines: all.slice(skip, skip + take) };
}

export async function facets() {
  const pharmacies = await prisma.pharmacy.findMany({
    where: { verificationStatus: 'APPROVED', active: true, inventory: { some: { quantityAvailable: { gt: 0 }, medicine: { requiresPrescription: false, active: true } } } },
    select: { serviceAreas: true },
  });
  const areas = [...new Set(pharmacies.flatMap((p) => p.serviceAreas))].sort((a, b) => a.localeCompare(b));
  return { areas };
}
