import { Prisma, type UserRole } from '@prisma/client';
import { prisma } from '@/lib/db';
import { getEnv } from '@/lib/env';
import { logger } from '@/lib/logger';
import { BadRequestError, ConflictError, ForbiddenError, NotFoundError, ServiceUnavailableError } from '@/lib/errors';
import { createOrder, isConfigured, verifySignature } from '@/lib/payments/razorpay';
import { notify } from '@/modules/notifications/notifications.service';
import { recordAuditEvent } from '@/server/audit';
import type { AuditContext } from '@/server/audit';
import type { bookOrderSchema, cancelOrderSchema, dispatchOrderSchema, verifyOrderPaymentSchema } from './orders.schemas';
import type { z } from 'zod';

type BookOrderInput = z.infer<typeof bookOrderSchema>;
type VerifyOrderPaymentInput = z.infer<typeof verifyOrderPaymentSchema>;
type CancelOrderInput = z.infer<typeof cancelOrderSchema>;
type DispatchOrderInput = z.infer<typeof dispatchOrderSchema>;

export async function listFinalizedPrescriptionsForPatient(patientUserId: string) {
  return prisma.prescription.findMany({
    where: { patientUserId, status: 'FINALIZED' },
    include: {
      items: true,
      doctorProfile: { select: { title: true, firstName: true, lastName: true } },
    },
    orderBy: { finalizedAt: 'desc' },
  });
}

export interface PrescriptionItemMatch {
  prescriptionItemId: string;
  productName: string;
  medicineId: string | null;
  available: boolean;
  quantityAvailable: number;
  price: number | null;
}

// Shows which of a finalized prescription's items this specific pharmacy can
// actually fulfil, before the patient commits to an order — an item whose
// productName was never resolved to a catalogued Medicine (medicineId null,
// e.g. a compounded/free-text product), or one this pharmacy simply doesn't
// stock, is excluded from what can be ordered.
export async function matchPrescriptionAtPharmacy(patientUserId: string, prescriptionId: string, pharmacyId: string): Promise<PrescriptionItemMatch[]> {
  const prescription = await prisma.prescription.findFirst({
    where: { id: prescriptionId, patientUserId, status: 'FINALIZED' },
    include: { items: true },
  });
  if (!prescription) throw new NotFoundError('Prescription not found');

  const pharmacy = await prisma.pharmacy.findFirst({ where: { id: pharmacyId, verificationStatus: 'APPROVED', active: true } });
  if (!pharmacy) throw new NotFoundError('Pharmacy not found');

  const medicineIds = prescription.items.map((i) => i.medicineId).filter((id): id is string => Boolean(id));
  const inventory = await prisma.pharmacyInventory.findMany({
    where: { pharmacyId, medicineId: { in: medicineIds }, quantityAvailable: { gt: 0 } },
  });
  const byMedicine = new Map<string, { quantityAvailable: number; price: number }>();
  for (const row of inventory) {
    const existing = byMedicine.get(row.medicineId);
    if (existing) {
      existing.quantityAvailable += row.quantityAvailable;
      existing.price = Math.min(existing.price, row.price);
    } else {
      byMedicine.set(row.medicineId, { quantityAvailable: row.quantityAvailable, price: row.price });
    }
  }

  return prescription.items.map((item) => {
    const match = item.medicineId ? byMedicine.get(item.medicineId) : undefined;
    return {
      prescriptionItemId: item.id,
      productName: item.productName,
      medicineId: item.medicineId,
      available: Boolean(match),
      quantityAvailable: match?.quantityAvailable ?? 0,
      price: match?.price ?? null,
    };
  });
}

async function restockItems(tx: Prisma.TransactionClient, orderId: string) {
  const items = await tx.medicineOrderItem.findMany({ where: { medicineOrderId: orderId } });
  const order = await tx.medicineOrder.findUniqueOrThrow({ where: { id: orderId } });
  for (const item of items) {
    await tx.pharmacyInventory.updateMany({
      where: { pharmacyId: order.pharmacyId, medicineId: item.medicineId, batchNumber: item.batchNumber },
      data: { quantityAvailable: { increment: item.quantity } },
    });
  }
}

async function releaseOrder(orderId: string, reason: string) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.medicineOrder.findUnique({ where: { id: orderId } });
    if (!order) return;
    await restockItems(tx, orderId);
    await tx.medicineOrder.update({ where: { id: orderId }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason } });
    if (order.paymentId) await tx.payment.update({ where: { id: order.paymentId }, data: { status: 'FAILED' } });
  });
}

export async function bookOrder(patientUserId: string, dto: BookOrderInput) {
  if (!isConfigured()) {
    throw new ServiceUnavailableError('Online payments are not configured in this environment yet — ordering is unavailable.');
  }

  const pharmacy = await prisma.pharmacy.findFirst({ where: { id: dto.pharmacyId, verificationStatus: 'APPROVED', active: true } });
  if (!pharmacy) throw new NotFoundError('Pharmacy not found');

  let prescription: { id: string; items: { id: string; medicineId: string | null }[] } | null = null;
  if (dto.prescriptionId) {
    prescription = await prisma.prescription.findFirst({
      where: { id: dto.prescriptionId, patientUserId, status: 'FINALIZED' },
      include: { items: true },
    });
    if (!prescription) throw new NotFoundError('Prescription not found');
  }

  const medicines = await prisma.medicine.findMany({ where: { id: { in: dto.items.map((i) => i.medicineId) }, active: true } });
  if (medicines.length !== dto.items.length) throw new BadRequestError('One or more medicines are unavailable');
  const medicineById = new Map(medicines.map((m) => [m.id, m]));

  const prescriptionItemByMedicineId = new Map((prescription?.items ?? []).filter((i) => i.medicineId).map((i) => [i.medicineId as string, i.id]));

  type ResolvedItem = { medicineId: string; medicineName: string; quantity: number; batchNumber: string; unitPrice: number; prescriptionItemId?: string };
  const resolvedItems: ResolvedItem[] = [];

  for (const requested of dto.items) {
    const medicine = medicineById.get(requested.medicineId)!;
    if (medicine.requiresPrescription) {
      const prescriptionItemId = prescriptionItemByMedicineId.get(medicine.id);
      if (!prescriptionItemId) {
        throw new BadRequestError(`${medicine.name} requires a prescription and was not found on the selected prescription`);
      }
      resolvedItems.push({ medicineId: medicine.id, medicineName: medicine.name, quantity: requested.quantity, batchNumber: '', unitPrice: 0, prescriptionItemId });
    } else {
      resolvedItems.push({ medicineId: medicine.id, medicineName: medicine.name, quantity: requested.quantity, batchNumber: '', unitPrice: 0 });
    }
  }

  const { order, paymentId, totalPrice } = await prisma.$transaction(async (tx) => {
    let totalPrice = 0;
    for (const item of resolvedItems) {
      // FEFO (first-expiry-first-out): the soonest-expiring batch with
      // enough stock to cover the whole quantity in one line — splitting a
      // single order line across multiple batches is out of scope this
      // phase, so insufficient stock in any one batch fails the booking
      // rather than silently partial-filling it.
      const batch = await tx.pharmacyInventory.findFirst({
        where: { pharmacyId: pharmacy.id, medicineId: item.medicineId, quantityAvailable: { gte: item.quantity } },
        orderBy: { expiryDate: 'asc' },
      });
      if (!batch) throw new BadRequestError(`Insufficient stock for ${item.medicineName} at this pharmacy`);
      await tx.pharmacyInventory.update({ where: { id: batch.id }, data: { quantityAvailable: { decrement: item.quantity } } });
      item.batchNumber = batch.batchNumber;
      item.unitPrice = batch.price;
      totalPrice += batch.price * item.quantity;
    }

    const created = await tx.medicineOrder.create({
      data: {
        prescriptionId: dto.prescriptionId,
        patientUserId,
        careRecipientFamilyMemberId: dto.careRecipientFamilyMemberId,
        pharmacyId: pharmacy.id,
        deliveryAddress: dto.deliveryAddress,
        items: {
          create: resolvedItems.map((item) => ({
            medicineId: item.medicineId,
            batchNumber: item.batchNumber,
            quantity: item.quantity,
            unitPrice: item.unitPrice,
            prescriptionItemId: item.prescriptionItemId,
          })),
        },
      },
    });
    const payment = await tx.payment.create({
      data: { payerUserId: patientUserId, purpose: 'MEDICINE_ORDER', purposeEntityId: created.id, amount: totalPrice, status: 'CREATED' },
    });
    const order = await tx.medicineOrder.update({ where: { id: created.id }, data: { paymentId: payment.id } });
    return { order, paymentId: payment.id, totalPrice };
  });

  try {
    const gatewayOrder = await createOrder({
      amountRupees: totalPrice,
      receipt: order.id,
      notes: { medicineOrderId: order.id, pharmacyId: pharmacy.id },
    });
    const updatedPayment = await prisma.payment.update({
      where: { id: paymentId },
      data: { gatewayOrderId: gatewayOrder.id, status: 'PENDING' },
    });
    return { order, payment: updatedPayment, razorpayOrder: gatewayOrder, razorpayKeyId: getEnv().RAZORPAY_KEY_ID };
  } catch (err) {
    await releaseOrder(order.id, 'Payment gateway error while starting checkout');
    logger.error('medicines', 'razorpay order creation failed', err, { orderId: order.id });
    throw new ServiceUnavailableError('Could not start payment — please try again.');
  }
}

// Shared by the checkout-verification route and the webhook, keyed by the
// gateway order id — idempotent, mirrors
// modules/diagnostics/orders.service.ts's finalizeOrderPaymentByOrder. The
// order itself stays PENDING (see schema comment on MedicineOrderStatus) —
// payment.status is what actually flips.
export async function finalizeMedicineOrderPaymentByOrder(params: { gatewayOrderId: string; gatewayPaymentId: string; gatewaySignature: string }) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findUnique({ where: { gatewayOrderId: params.gatewayOrderId } });
    if (!payment) throw new NotFoundError('Payment not found for this order');
    if (payment.status === 'SUCCESS') {
      return tx.medicineOrder.findUniqueOrThrow({ where: { paymentId: payment.id } });
    }
    await tx.payment.update({
      where: { id: payment.id },
      data: {
        status: 'SUCCESS',
        gatewayPaymentId: params.gatewayPaymentId,
        gatewaySignature: params.gatewaySignature,
        verifiedAt: new Date(),
      },
    });
    return tx.medicineOrder.findUniqueOrThrow({ where: { paymentId: payment.id } });
  });
}

export async function verifyOrderPayment(patientUserId: string, dto: VerifyOrderPaymentInput, auditCtx: AuditContext) {
  const order = await prisma.medicineOrder.findFirst({ where: { id: dto.orderId, patientUserId }, include: { payment: true, pharmacy: true } });
  if (!order) throw new NotFoundError('Order not found');
  if (!order.payment || order.payment.status !== 'PENDING') throw new ConflictError('This order is not awaiting payment');
  if (order.payment.gatewayOrderId !== dto.razorpayOrderId) throw new BadRequestError('Order mismatch');

  const valid = verifySignature({
    orderId: dto.razorpayOrderId,
    paymentId: dto.razorpayPaymentId,
    signature: dto.razorpaySignature,
  });
  if (!valid) {
    await prisma.payment.update({ where: { id: order.payment.id }, data: { status: 'FAILED' } });
    throw new BadRequestError('Payment verification failed');
  }

  const confirmed = await finalizeMedicineOrderPaymentByOrder({
    gatewayOrderId: dto.razorpayOrderId,
    gatewayPaymentId: dto.razorpayPaymentId,
    gatewaySignature: dto.razorpaySignature,
  });

  await recordAuditEvent(auditCtx, {
    eventType: 'MEDICINE_ORDER',
    action: 'CONFIRMED',
    resourceType: 'MedicineOrder',
    resourceId: order.id,
  });
  await notify(patientUserId, 'IN_APP', 'medicine.order_confirmed', { orderId: order.id });
  await notify(order.pharmacy.userId, 'IN_APP', 'medicine.order_placed', { orderId: order.id });

  return confirmed;
}

export async function cancelOrder(actorUserId: string, role: UserRole, orderId: string, dto: CancelOrderInput, auditCtx: AuditContext) {
  const order = await prisma.medicineOrder.findUnique({ where: { id: orderId }, include: { pharmacy: true } });
  if (!order) throw new NotFoundError('Order not found');

  const isOwnerPatient = role === 'PATIENT' && order.patientUserId === actorUserId;
  const isOwnerPharmacy = role === 'PHARMACY' && order.pharmacy.userId === actorUserId;
  if (!isOwnerPatient && !isOwnerPharmacy) throw new ForbiddenError('Not allowed to cancel this order');

  if (order.status !== 'PENDING' && order.status !== 'ACCEPTED') {
    throw new ConflictError('This order can no longer be cancelled');
  }

  await prisma.$transaction(async (tx) => {
    await restockItems(tx, orderId);
    await tx.medicineOrder.update({
      where: { id: orderId },
      data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: dto.reason },
    });
  });

  await recordAuditEvent(auditCtx, {
    eventType: 'MEDICINE_ORDER',
    action: 'CANCELLED',
    resourceType: 'MedicineOrder',
    resourceId: orderId,
    metadata: { cancelledBy: role },
  });

  const notifyUserId = isOwnerPatient ? order.pharmacy.userId : order.patientUserId;
  await notify(notifyUserId, 'IN_APP', 'medicine.order_cancelled', { orderId });

  return prisma.medicineOrder.findUniqueOrThrow({ where: { id: orderId } });
}

async function ownedByPharmacy(pharmacyUserId: string, orderId: string) {
  const order = await prisma.medicineOrder.findUnique({ where: { id: orderId }, include: { pharmacy: true, payment: true } });
  if (!order || order.pharmacy.userId !== pharmacyUserId) throw new NotFoundError('Order not found');
  return order;
}

export async function acceptOrder(pharmacyUserId: string, orderId: string) {
  const order = await ownedByPharmacy(pharmacyUserId, orderId);
  if (order.status !== 'PENDING') throw new BadRequestError('Only a pending order can be accepted');
  if (order.payment?.status !== 'SUCCESS') throw new ConflictError('This order has not been paid for yet');
  const updated = await prisma.medicineOrder.update({ where: { id: orderId }, data: { status: 'ACCEPTED' } });
  await notify(order.patientUserId, 'IN_APP', 'medicine.order_accepted', { orderId });
  return updated;
}

export async function markPacking(pharmacyUserId: string, orderId: string) {
  const order = await ownedByPharmacy(pharmacyUserId, orderId);
  if (order.status !== 'ACCEPTED') throw new BadRequestError('Only an accepted order can move to packing');
  return prisma.medicineOrder.update({ where: { id: orderId }, data: { status: 'PACKING' } });
}

export async function dispatchOrder(pharmacyUserId: string, orderId: string, dto: DispatchOrderInput) {
  const order = await ownedByPharmacy(pharmacyUserId, orderId);
  if (order.status !== 'PACKING') throw new BadRequestError('Only an order being packed can be dispatched');

  const [, updatedOrder] = await prisma.$transaction([
    prisma.shipment.upsert({
      where: { medicineOrderId: orderId },
      update: { carrier: dto.carrier, trackingRef: dto.trackingRef, dispatchedAt: new Date() },
      create: { medicineOrderId: orderId, carrier: dto.carrier, trackingRef: dto.trackingRef, dispatchedAt: new Date() },
    }),
    prisma.medicineOrder.update({ where: { id: orderId }, data: { status: 'DISPATCHED' } }),
  ]);
  await notify(order.patientUserId, 'IN_APP', 'medicine.order_dispatched', { orderId });
  return updatedOrder;
}

export async function markDelivered(pharmacyUserId: string, orderId: string) {
  const order = await ownedByPharmacy(pharmacyUserId, orderId);
  if (order.status !== 'DISPATCHED') throw new BadRequestError('Only a dispatched order can be marked delivered');

  const [, updatedOrder] = await prisma.$transaction([
    prisma.shipment.update({ where: { medicineOrderId: orderId }, data: { deliveredAt: new Date() } }),
    prisma.medicineOrder.update({ where: { id: orderId }, data: { status: 'DELIVERED' } }),
  ]);
  await notify(order.patientUserId, 'IN_APP', 'medicine.order_delivered', { orderId });
  return updatedOrder;
}

function detailInclude() {
  return {
    pharmacy: { select: { id: true, name: true, serviceAreas: true } },
    items: { include: { medicine: { select: { name: true, form: true, strength: true } } } },
    shipment: true,
    payment: { select: { status: true, amount: true } },
  };
}

export async function getOrder(userId: string, role: UserRole, orderId: string) {
  const order = await prisma.medicineOrder.findUnique({ where: { id: orderId }, include: { ...detailInclude(), pharmacy: true } });
  if (!order) throw new NotFoundError('Order not found');
  const isPatient = role === 'PATIENT' && order.patientUserId === userId;
  const isPharmacy = role === 'PHARMACY' && order.pharmacy.userId === userId;
  if (!isPatient && !isPharmacy) throw new NotFoundError('Order not found');
  return order;
}

export async function listMineAsPatient(patientUserId: string) {
  return prisma.medicineOrder.findMany({
    where: { patientUserId },
    include: {
      pharmacy: { select: { name: true } },
      items: { include: { medicine: { select: { name: true } } } },
      shipment: true,
    },
    orderBy: { createdAt: 'desc' },
  });
}

export async function listMineAsPharmacy(pharmacyUserId: string) {
  const pharmacy = await prisma.pharmacy.findUnique({ where: { userId: pharmacyUserId } });
  if (!pharmacy) throw new NotFoundError('Pharmacy profile not found');
  return prisma.medicineOrder.findMany({
    where: { pharmacyId: pharmacy.id, payment: { status: 'SUCCESS' } },
    include: {
      patientUser: { select: { mobile: true, patientProfile: { select: { firstName: true, lastName: true } } } },
      items: { include: { medicine: { select: { name: true } } } },
    },
    orderBy: { createdAt: 'asc' },
  });
}
