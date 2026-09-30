import { prisma } from '@/lib/db';
import { BadRequestError, NotFoundError } from '@/lib/errors';
import { bookOrder } from './orders.service';
import type { addToCartSchema, checkoutCartSchema, updateCartItemSchema } from './cart.schemas';
import type { z } from 'zod';

type AddToCartInput = z.infer<typeof addToCartSchema>;
type UpdateCartItemInput = z.infer<typeof updateCartItemSchema>;
type CheckoutCartInput = z.infer<typeof checkoutCartSchema>;

// EXPANSION-1b — one active cart per (patient, pharmacy), find-or-create,
// same pattern as ensurePharmacyProfile/resolveMedicineByName elsewhere in
// this module rather than a DB-level partial-unique-index (Postgres would
// need one to enforce "at most one ACTIVE cart" since NULL-style
// uniqueness tricks don't apply to a plain status column — service-layer
// find-or-create is simpler and consistent with the rest of this codebase).
async function getOrCreateActiveCart(patientUserId: string, pharmacyId: string) {
  const existing = await prisma.cart.findFirst({ where: { patientUserId, pharmacyId, status: 'ACTIVE' } });
  if (existing) return existing;
  return prisma.cart.create({ data: { patientUserId, pharmacyId, status: 'ACTIVE' } });
}

export async function addToCart(patientUserId: string, dto: AddToCartInput) {
  const pharmacy = await prisma.pharmacy.findFirst({ where: { id: dto.pharmacyId, verificationStatus: 'APPROVED', active: true } });
  if (!pharmacy) throw new NotFoundError('Pharmacy not found');

  const medicine = await prisma.medicine.findFirst({ where: { id: dto.medicineId, active: true } });
  if (!medicine) throw new NotFoundError('Medicine not found');
  if (medicine.requiresPrescription) {
    throw new BadRequestError('This item requires a prescription — order it from a finalized prescription instead of the cart.');
  }

  if (dto.variantId) {
    const variant = await prisma.medicineVariant.findFirst({ where: { id: dto.variantId, medicineId: medicine.id, active: true } });
    if (!variant) throw new NotFoundError('Pack size not found for this medicine');
  }

  const stocked = await prisma.pharmacyInventory.findFirst({
    where: { pharmacyId: pharmacy.id, medicineId: medicine.id, variantId: dto.variantId ?? null, quantityAvailable: { gt: 0 } },
  });
  if (!stocked) throw new BadRequestError('This pharmacy does not currently stock this item');

  const cart = await getOrCreateActiveCart(patientUserId, pharmacy.id);
  const existingItem = await prisma.cartItem.findFirst({ where: { cartId: cart.id, medicineId: medicine.id, variantId: dto.variantId ?? null } });

  if (existingItem) {
    await prisma.cartItem.update({ where: { id: existingItem.id }, data: { quantity: existingItem.quantity + dto.quantity } });
  } else {
    await prisma.cartItem.create({ data: { cartId: cart.id, medicineId: medicine.id, variantId: dto.variantId, quantity: dto.quantity } });
  }

  return getCart(patientUserId, cart.id);
}

async function ownedCartItem(patientUserId: string, cartItemId: string) {
  const item = await prisma.cartItem.findFirst({ where: { id: cartItemId, cart: { patientUserId, status: 'ACTIVE' } }, include: { cart: true } });
  if (!item) throw new NotFoundError('Cart item not found');
  return item;
}

export async function updateCartItem(patientUserId: string, cartItemId: string, dto: UpdateCartItemInput) {
  const item = await ownedCartItem(patientUserId, cartItemId);
  if (dto.quantity === 0) {
    await prisma.cartItem.delete({ where: { id: item.id } });
  } else {
    await prisma.cartItem.update({ where: { id: item.id }, data: { quantity: dto.quantity } });
  }
  return getCart(patientUserId, item.cartId);
}

export async function removeCartItem(patientUserId: string, cartItemId: string) {
  const item = await ownedCartItem(patientUserId, cartItemId);
  await prisma.cartItem.delete({ where: { id: item.id } });
  return getCart(patientUserId, item.cartId);
}

// Resolves each cart item's current price/availability from live
// PharmacyInventory rather than a snapshot on the cart — a cart is a
// pre-purchase intent list, not a receipt; the price shown is always
// today's, and an item this pharmacy no longer stocks is surfaced
// honestly (available: false) rather than silently dropped.
async function priceCartItems(items: { id: string; medicineId: string; variantId: string | null; quantity: number; medicine: { name: string; imageUrl: string | null }; variant: { label: string } | null }[], pharmacyId: string) {
  return Promise.all(
    items.map(async (item) => {
      const cheapestBatch = await prisma.pharmacyInventory.findFirst({
        where: { pharmacyId, medicineId: item.medicineId, variantId: item.variantId, quantityAvailable: { gte: item.quantity } },
        orderBy: { price: 'asc' },
      });
      return {
        id: item.id,
        medicineId: item.medicineId,
        medicineName: item.medicine.name,
        imageUrl: item.medicine.imageUrl,
        variantId: item.variantId,
        variantLabel: item.variant?.label ?? null,
        quantity: item.quantity,
        unitPrice: cheapestBatch?.price ?? null,
        available: Boolean(cheapestBatch),
      };
    }),
  );
}

export async function getCart(patientUserId: string, cartId: string) {
  const cart = await prisma.cart.findFirst({
    where: { id: cartId, patientUserId },
    include: {
      pharmacy: { select: { id: true, name: true } },
      items: { include: { medicine: { select: { name: true, imageUrl: true } }, variant: { select: { label: true } } } },
    },
  });
  if (!cart) throw new NotFoundError('Cart not found');

  const items = await priceCartItems(cart.items, cart.pharmacyId);
  const subtotal = items.reduce((sum, i) => sum + (i.unitPrice ?? 0) * i.quantity, 0);
  return { id: cart.id, pharmacy: cart.pharmacy, status: cart.status, items, subtotal };
}

export async function listMyCarts(patientUserId: string) {
  const carts = await prisma.cart.findMany({
    where: { patientUserId, status: 'ACTIVE' },
    include: {
      pharmacy: { select: { id: true, name: true } },
      items: { include: { medicine: { select: { name: true, imageUrl: true } }, variant: { select: { label: true } } } },
    },
    orderBy: { updatedAt: 'desc' },
  });

  return Promise.all(
    carts
      .filter((c) => c.items.length > 0)
      .map(async (cart) => {
        const items = await priceCartItems(cart.items, cart.pharmacyId);
        const subtotal = items.reduce((sum, i) => sum + (i.unitPrice ?? 0) * i.quantity, 0);
        return { id: cart.id, pharmacy: cart.pharmacy, status: cart.status, items, subtotal };
      }),
  );
}

// Total item count across every active cart — for a header badge. A
// cheap count query, no pricing lookups needed.
export async function myCartItemCount(patientUserId: string): Promise<number> {
  const result = await prisma.cartItem.aggregate({
    where: { cart: { patientUserId, status: 'ACTIVE' } },
    _sum: { quantity: true },
  });
  return result._sum.quantity ?? 0;
}

// Converts a cart into a real MedicineOrder by delegating to bookOrder —
// reuses its FEFO batch selection, variant matching, and payment-order
// creation rather than duplicating any of that. Two-step, not one
// transaction (bookOrder owns its own): a crash between "order created"
// and "cart marked CONVERTED" would leave a stale-looking but harmless
// ACTIVE cart — recoverable (the items are simply still there to check
// out again or clear), not a data-corrupting failure mode, so this
// doesn't need bookOrder itself refactored to accept an external
// transaction just to close that narrow a window.
export async function checkoutCart(patientUserId: string, cartId: string, dto: CheckoutCartInput) {
  const cart = await prisma.cart.findFirst({ where: { id: cartId, patientUserId, status: 'ACTIVE' }, include: { items: true } });
  if (!cart) throw new NotFoundError('Cart not found');
  if (cart.items.length === 0) throw new BadRequestError('This cart is empty');

  const result = await bookOrder(patientUserId, {
    pharmacyId: cart.pharmacyId,
    deliveryAddress: dto.deliveryAddress,
    careRecipientFamilyMemberId: dto.careRecipientFamilyMemberId,
    items: cart.items.map((i) => ({ medicineId: i.medicineId, variantId: i.variantId ?? undefined, quantity: i.quantity })),
  });

  await prisma.cart.update({ where: { id: cart.id }, data: { status: 'CONVERTED', convertedOrderId: result.order.id } });
  return result;
}
