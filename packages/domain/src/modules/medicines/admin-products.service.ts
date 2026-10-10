import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../../lib/db';
import { BadRequestError, ConflictError, NotFoundError } from '../../lib/errors';
import { deleteObject, putObject } from '../../lib/storage';
import { recordAuditEvent, type AuditContext } from '../../server/audit';

// Ops-admin management of the master product catalogue (Medicine rows): the
// product itself, its list price (mrp, rupees) and its image. Pharmacies still
// set their own selling price and stock on PharmacyInventory.

export const adminProductSchema = z.object({
  name: z.string().trim().min(2, 'Enter the product name').max(200),
  genericName: z.string().trim().max(200).optional(),
  brandName: z.string().trim().max(200).optional(),
  category: z.string().trim().max(100).optional(),
  mrp: z.coerce.number().int('MRP must be a whole number of rupees').min(0).max(1_000_000).optional(),
  requiresPrescription: z.coerce.boolean().default(false),
});
export type AdminProductInput = z.infer<typeof adminProductSchema>;

// Partial, nullable-aware: unlike the multipart create form, edit goes over
// a JSON `payload` field (see admin/products/[id]/route.ts), so an admin can
// distinguish "leave as is" (omit the key) from "clear it" (send null) for
// the nullable catalogue fields — a create form has nothing to clear yet.
export const updateAdminProductSchema = z.object({
  name: z.string().trim().min(2, 'Enter the product name').max(200).optional(),
  genericName: z.string().trim().max(200).nullable().optional(),
  brandName: z.string().trim().max(200).nullable().optional(),
  category: z.string().trim().max(100).nullable().optional(),
  mrp: z.number().int('MRP must be a whole number of rupees').min(0).max(1_000_000).nullable().optional(),
  requiresPrescription: z.boolean().optional(),
  active: z.boolean().optional(),
});
export type UpdateAdminProductInput = z.infer<typeof updateAdminProductSchema>;

// EXPANSION-1's purchasable pack size/variant, admin-managed. sortOrder
// controls display order on patient-facing catalogue; label uniqueness is
// enforced by the schema's @@unique([medicineId, label]), caught below as P2002.
export const createProductVariantSchema = z.object({
  label: z.string().trim().min(1, 'Enter a variant label').max(100),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});
export type CreateProductVariantInput = z.infer<typeof createProductVariantSchema>;

export const updateProductVariantSchema = z.object({
  label: z.string().trim().min(1, 'Enter a variant label').max(100).optional(),
  sortOrder: z.number().int().optional(),
  active: z.boolean().optional(),
});
export type UpdateProductVariantInput = z.infer<typeof updateProductVariantSchema>;

export interface ProductImage {
  body: Uint8Array;
  contentType: string;
}

export const MAX_PRODUCT_IMAGE_BYTES = 2 * 1024 * 1024;

const EXTENSION_FOR_TYPE: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
};

export function validateProductImage(image: ProductImage): string {
  const ext = EXTENSION_FOR_TYPE[image.contentType];
  if (!ext) throw new BadRequestError('Product image must be a JPEG, PNG or WebP file');
  if (image.body.byteLength > MAX_PRODUCT_IMAGE_BYTES) {
    throw new BadRequestError('Product image must be 2 MB or smaller');
  }
  return ext;
}

// Shared by the list and by edit/variant-write return values, so the admin
// UI always gets the same row shape back regardless of which call produced it.
const ADMIN_PRODUCT_SELECT = {
  id: true,
  name: true,
  genericName: true,
  brandName: true,
  category: true,
  mrp: true,
  imageUrl: true,
  active: true,
  requiresPrescription: true,
  createdAt: true,
  variants: {
    orderBy: { sortOrder: 'asc' as const },
    select: { id: true, label: true, sortOrder: true, active: true },
  },
} satisfies Prisma.MedicineSelect;

export async function listAdminProducts() {
  return prisma.medicine.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: ADMIN_PRODUCT_SELECT,
  });
}

export async function createAdminProduct(
  dto: AdminProductInput,
  image: ProductImage | null,
  auditCtx: AuditContext,
) {
  const ext = image ? validateProductImage(image) : null;

  const medicine = await prisma.medicine.create({
    data: {
      name: dto.name,
      genericName: dto.genericName || null,
      brandName: dto.brandName || null,
      category: dto.category || null,
      mrp: dto.mrp ?? null,
      requiresPrescription: dto.requiresPrescription,
    },
  });

  if (image && ext) {
    // Keyed by the medicine id so the file and the row can't drift apart.
    const file = `${medicine.id}.${ext}`;
    await putObject({ key: `catalogue/${file}`, body: image.body, contentType: image.contentType });
    await prisma.medicine.update({
      where: { id: medicine.id },
      data: { imageUrl: `/api/v1/catalogue/images/${file}` },
    });
  }

  await recordAuditEvent(auditCtx, {
    eventType: 'CATALOGUE',
    action: 'PRODUCT_CREATED',
    resourceType: 'Medicine',
    resourceId: medicine.id,
    metadata: { mrp: dto.mrp ?? null, hasImage: Boolean(image) },
  });

  return prisma.medicine.findUniqueOrThrow({ where: { id: medicine.id }, select: ADMIN_PRODUCT_SELECT });
}

export async function updateAdminProduct(
  id: string,
  dto: UpdateAdminProductInput,
  image: ProductImage | null,
  auditCtx: AuditContext,
) {
  const existing = await prisma.medicine.findUnique({ where: { id } });
  if (!existing) throw new NotFoundError('Product not found');

  let imageUrl: string | undefined;
  if (image) {
    const ext = validateProductImage(image);
    const file = `${id}.${ext}`;
    await putObject({ key: `catalogue/${file}`, body: image.body, contentType: image.contentType });
    imageUrl = `/api/v1/catalogue/images/${file}`;

    // Keyed by medicine id, so only the extension can change between
    // uploads — clean up the old file rather than leaving it orphaned.
    const previousFile = existing.imageUrl?.split('/').pop();
    if (previousFile && previousFile !== file) await deleteObject(`catalogue/${previousFile}`);
  }

  const medicine = await prisma.medicine.update({
    where: { id },
    data: {
      ...(dto.name !== undefined ? { name: dto.name } : {}),
      ...(dto.genericName !== undefined ? { genericName: dto.genericName } : {}),
      ...(dto.brandName !== undefined ? { brandName: dto.brandName } : {}),
      ...(dto.category !== undefined ? { category: dto.category } : {}),
      ...(dto.mrp !== undefined ? { mrp: dto.mrp } : {}),
      ...(dto.requiresPrescription !== undefined ? { requiresPrescription: dto.requiresPrescription } : {}),
      ...(dto.active !== undefined ? { active: dto.active } : {}),
      ...(imageUrl !== undefined ? { imageUrl } : {}),
    },
    select: ADMIN_PRODUCT_SELECT,
  });

  await recordAuditEvent(auditCtx, {
    eventType: 'CATALOGUE',
    action: 'PRODUCT_UPDATED',
    resourceType: 'Medicine',
    resourceId: id,
    metadata: { fields: Object.keys(dto), hasNewImage: Boolean(image) },
  });

  return medicine;
}

export async function createProductVariant(medicineId: string, dto: CreateProductVariantInput, auditCtx: AuditContext) {
  const medicine = await prisma.medicine.findUnique({ where: { id: medicineId } });
  if (!medicine) throw new NotFoundError('Product not found');

  try {
    const variant = await prisma.medicineVariant.create({
      data: {
        medicineId,
        label: dto.label,
        sortOrder: dto.sortOrder ?? 0,
        active: dto.active ?? true,
      },
    });
    await recordAuditEvent(auditCtx, {
      eventType: 'CATALOGUE',
      action: 'PRODUCT_VARIANT_CREATED',
      resourceType: 'MedicineVariant',
      resourceId: variant.id,
      metadata: { medicineId, label: variant.label },
    });
    return variant;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError(`This product already has a "${dto.label}" variant`);
    }
    throw error;
  }
}

export async function updateProductVariant(
  medicineId: string,
  variantId: string,
  dto: UpdateProductVariantInput,
  auditCtx: AuditContext,
) {
  const existing = await prisma.medicineVariant.findFirst({ where: { id: variantId, medicineId } });
  if (!existing) throw new NotFoundError('Variant not found');

  try {
    const variant = await prisma.medicineVariant.update({
      where: { id: variantId },
      data: {
        ...(dto.label !== undefined ? { label: dto.label } : {}),
        ...(dto.sortOrder !== undefined ? { sortOrder: dto.sortOrder } : {}),
        ...(dto.active !== undefined ? { active: dto.active } : {}),
      },
    });
    await recordAuditEvent(auditCtx, {
      eventType: 'CATALOGUE',
      action: 'PRODUCT_VARIANT_UPDATED',
      resourceType: 'MedicineVariant',
      resourceId: variantId,
      metadata: { medicineId, fields: Object.keys(dto) },
    });
    return variant;
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictError(`This product already has a "${dto.label}" variant`);
    }
    throw error;
  }
}

export async function removeProductVariant(medicineId: string, variantId: string, auditCtx: AuditContext) {
  const existing = await prisma.medicineVariant.findFirst({ where: { id: variantId, medicineId } });
  if (!existing) throw new NotFoundError('Variant not found');

  await prisma.medicineVariant.delete({ where: { id: variantId } });
  await recordAuditEvent(auditCtx, {
    eventType: 'CATALOGUE',
    action: 'PRODUCT_VARIANT_REMOVED',
    resourceType: 'MedicineVariant',
    resourceId: variantId,
    metadata: { medicineId, label: existing.label },
  });
}

// Serves the public catalogue image path. The file name is validated before it
// becomes a storage key, so this route can only read catalogue/<id>.<ext>.
const IMAGE_FILE_PATTERN = /^[a-z0-9]+\.(jpg|png|webp)$/;

export function catalogueImageKey(file: string): string {
  if (!IMAGE_FILE_PATTERN.test(file)) throw new NotFoundError('Image not found');
  return `catalogue/${file}`;
}
