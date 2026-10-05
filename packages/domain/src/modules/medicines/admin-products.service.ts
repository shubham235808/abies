import { z } from 'zod';
import { prisma } from '../../lib/db';
import { BadRequestError, NotFoundError } from '../../lib/errors';
import { putObject } from '../../lib/storage';
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

export async function listAdminProducts() {
  return prisma.medicine.findMany({
    orderBy: { createdAt: 'desc' },
    take: 200,
    select: {
      id: true,
      name: true,
      brandName: true,
      category: true,
      mrp: true,
      imageUrl: true,
      active: true,
      createdAt: true,
    },
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

  return prisma.medicine.findUniqueOrThrow({ where: { id: medicine.id } });
}

// Serves the public catalogue image path. The file name is validated before it
// becomes a storage key, so this route can only read catalogue/<id>.<ext>.
const IMAGE_FILE_PATTERN = /^[a-z0-9]+\.(jpg|png|webp)$/;

export function catalogueImageKey(file: string): string {
  if (!IMAGE_FILE_PATTERN.test(file)) throw new NotFoundError('Image not found');
  return `catalogue/${file}`;
}
