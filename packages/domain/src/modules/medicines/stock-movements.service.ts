import type { Prisma, StockMovementType } from '@prisma/client';
import { prisma } from '../../lib/db';
import { ensurePharmacyProfile } from './pharmacies.service';

// ENTERPRISE-7 — one row per quantityAvailable mutation, written in the
// same transaction as the mutation itself (docs/ENTERPRISE-DATA-MODEL-
// CHANGES.md §5's rollout instruction). Every existing inventory-mutation
// call site (addInventory, updateInventory's manual correction, online-
// order booking/cancellation) and the new POS sale go through this.
export async function recordStockMovement(
  tx: Prisma.TransactionClient,
  input: {
    pharmacyId: string;
    inventoryId: string;
    type: StockMovementType;
    quantityDelta: number;
    actorUserId: string;
    reason?: string;
    referenceType?: string;
    referenceId?: string;
  },
) {
  if (input.quantityDelta === 0) return;
  await tx.stockMovement.create({ data: input });
}

export async function listMyStockMovements(userId: string) {
  const pharmacy = await ensurePharmacyProfile(userId);
  return prisma.stockMovement.findMany({
    where: { pharmacyId: pharmacy.id },
    include: { inventory: { include: { medicine: { select: { name: true } } } } },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });
}
