import { prisma } from '@/lib/db';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { recordAuditEvent } from '@/server/audit';
import type { AuditContext } from '@/server/audit';
import { requireApprovedPharmacy } from './pharmacies.service';
import { recordStockMovement } from './stock-movements.service';
import type { posSaleSchema } from './pharmacies.schemas';
import type { z } from 'zod';

type PosSaleInput = z.infer<typeof posSaleSchema>;

// ENTERPRISE-7 — the walk-in counter sale. Requires an active TaxSettings
// row and a GstRateConfig match for every item's HSN code before it will
// record anything — a sale with a fabricated tax rate is worse than no POS
// at all, so this hard-fails rather than guessing (same rule as Razorpay's
// isConfigured() gate elsewhere in this codebase).
export async function recordSale(userId: string, dto: PosSaleInput, auditCtx: AuditContext) {
  const pharmacy = await requireApprovedPharmacy(userId);

  const taxSettings = await prisma.taxSettings.findUnique({ where: { pharmacyId: pharmacy.id } });
  if (!taxSettings || !taxSettings.active) {
    throw new BadRequestError('Set up GST registration under Tax Settings before recording a sale.');
  }

  const medicineIds = [...new Set(dto.items.map((i) => i.medicineId))];
  const medicines = await prisma.medicine.findMany({ where: { id: { in: medicineIds } } });
  const medicineById = new Map(medicines.map((m) => [m.id, m]));
  if (medicineById.size !== medicineIds.length) throw new BadRequestError('One or more medicines were not found');

  const hsnCodes = medicines.map((m) => m.hsnCode).filter((c): c is string => Boolean(c));
  const rates = await prisma.gstRateConfig.findMany({ where: { hsnCode: { in: hsnCodes }, active: true } });
  const rateByHsn = new Map(rates.map((r) => [r.hsnCode, r.ratePercent]));

  type ResolvedLine = { medicineId: string; medicineName: string; batchNumber: string; quantity: number; unitPrice: number; taxRatePercent: number; inventoryId: string; lineSubtotal: number; lineTax: number };
  const lines: ResolvedLine[] = [];

  for (const item of dto.items) {
    const medicine = medicineById.get(item.medicineId)!;
    if (!medicine.hsnCode) throw new BadRequestError(`${medicine.name} has no HSN code set — add one in the inventory before selling it at the counter.`);
    const ratePercent = rateByHsn.get(medicine.hsnCode);
    if (ratePercent === undefined) throw new BadRequestError(`No GST rate is configured for HSN code ${medicine.hsnCode} (${medicine.name}).`);

    const batch = await prisma.pharmacyInventory.findUnique({
      where: { pharmacyId_medicineId_batchNumber: { pharmacyId: pharmacy.id, medicineId: item.medicineId, batchNumber: item.batchNumber } },
    });
    if (!batch) throw new NotFoundError(`Batch ${item.batchNumber} for ${medicine.name} not found`);
    if (batch.quantityAvailable < item.quantity) throw new BadRequestError(`Insufficient stock for ${medicine.name} (batch ${item.batchNumber})`);

    const lineSubtotal = batch.price * item.quantity;
    const lineTax = Math.round((lineSubtotal * ratePercent) / 100);
    lines.push({
      medicineId: item.medicineId,
      medicineName: medicine.name,
      batchNumber: item.batchNumber,
      quantity: item.quantity,
      unitPrice: batch.price,
      taxRatePercent: ratePercent,
      inventoryId: batch.id,
      lineSubtotal,
      lineTax,
    });
  }

  const subtotal = lines.reduce((sum, l) => sum + l.lineSubtotal, 0);
  const taxAmount = lines.reduce((sum, l) => sum + l.lineTax, 0);
  const discountAmount = dto.discountAmount ?? 0;
  const totalAmount = subtotal - discountAmount + taxAmount;
  // Always intra-state: a POS sale happens in person at the pharmacy's own
  // registered location, so CGST+SGST (never IGST) — unlike an online
  // MedicineOrder shipped across state lines, which this model doesn't
  // cover yet.
  const cgst = Math.floor(taxAmount / 2);
  const sgst = taxAmount - cgst;

  const { sale, invoice } = await prisma.$transaction(async (tx) => {
    const sale = await tx.physicalSale.create({
      data: {
        pharmacyId: pharmacy.id,
        customerName: dto.customerName,
        customerPhone: dto.customerPhone,
        paymentMethod: dto.paymentMethod,
        upiReference: dto.upiReference,
        subtotal,
        discountAmount,
        taxAmount,
        totalAmount,
        soldByUserId: userId,
        items: {
          create: lines.map((l) => ({
            medicineId: l.medicineId,
            batchNumber: l.batchNumber,
            quantity: l.quantity,
            unitPrice: l.unitPrice,
            taxRate: l.taxRatePercent,
          })),
        },
      },
    });

    for (const line of lines) {
      await tx.pharmacyInventory.update({ where: { id: line.inventoryId }, data: { quantityAvailable: { decrement: line.quantity } } });
      await recordStockMovement(tx, {
        pharmacyId: pharmacy.id,
        inventoryId: line.inventoryId,
        type: 'SALE',
        quantityDelta: -line.quantity,
        actorUserId: userId,
        referenceType: 'PhysicalSale',
        referenceId: sale.id,
      });
    }

    // Sequence is a per-pharmacy count-and-increment inside this
    // transaction — adequate for a single-terminal POS; a genuinely
    // concurrent multi-terminal setup would need a DB sequence, which is a
    // later scale-up, not something to build ahead of any real usage.
    const existingCount = await tx.invoice.count({ where: { pharmacyId: pharmacy.id } });
    const invoiceNumber = `${taxSettings.invoicePrefix}-${String(existingCount + 1).padStart(6, '0')}`;
    const invoice = await tx.invoice.create({
      data: {
        pharmacyId: pharmacy.id,
        invoiceNumber,
        sourceType: 'PhysicalSale',
        sourceId: sale.id,
        cgst,
        sgst,
        igst: 0,
        totalTax: taxAmount,
        totalAmount,
      },
    });
    await tx.physicalSale.update({ where: { id: sale.id }, data: { invoiceId: invoice.id } });

    return { sale, invoice };
  });

  await recordAuditEvent(auditCtx, {
    eventType: 'PHARMACY_POS',
    action: 'SALE_RECORDED',
    resourceType: 'PhysicalSale',
    resourceId: sale.id,
    metadata: { totalAmount, invoiceNumber: invoice.invoiceNumber },
  });

  return getSale(userId, sale.id);
}

export async function listMySales(userId: string) {
  const pharmacy = await requireApprovedPharmacy(userId);
  return prisma.physicalSale.findMany({
    where: { pharmacyId: pharmacy.id },
    include: { items: { include: { medicine: { select: { name: true } } } }, invoice: true },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
}

export async function getSale(userId: string, saleId: string) {
  const pharmacy = await requireApprovedPharmacy(userId);
  const sale = await prisma.physicalSale.findFirst({
    where: { id: saleId, pharmacyId: pharmacy.id },
    include: { items: { include: { medicine: { select: { name: true } } } }, invoice: true, pharmacy: { include: { taxSettings: true } } },
  });
  if (!sale) throw new NotFoundError('Sale not found');
  return sale;
}
