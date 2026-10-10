// @prisma/client is only installed under packages/domain's own
// node_modules (strict pnpm, not hoisted to the repo root) — same reason
// db.ts itself is mocked by relative path below rather than '@abies/domain/lib/db'.
import { Prisma } from '../../packages/domain/node_modules/@prisma/client';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// Admin-portal-status-report.md §A gap-close: edit, active/inactive toggle,
// and variant CRUD for the master catalogue. Runs against an in-memory
// Medicine/MedicineVariant store (same no-database-needed approach as
// tests/unit/idempotency.test.ts), so it stays green independent of the
// shared dev Postgres's migration state or any other module's auth changes.
// Image-upload paths are deliberately left to the (real-storage) integration
// test alongside sibling medicines.service coverage — these only exercise
// the image === null branch, which never touches storage.ts.

interface MedicineRow {
  id: string;
  name: string;
  genericName: string | null;
  brandName: string | null;
  category: string | null;
  mrp: number | null;
  imageUrl: string | null;
  active: boolean;
  requiresPrescription: boolean;
}

interface VariantRow {
  id: string;
  medicineId: string;
  label: string;
  sortOrder: number;
  active: boolean;
}

const h = vi.hoisted(() => {
  const medicines: MedicineRow[] = [];
  const variants: VariantRow[] = [];
  const auditEvents: Record<string, unknown>[] = [];
  let nextVariantId = 1;

  function p2002(message: string): never {
    throw new Prisma.PrismaClientKnownRequestError(message, { code: 'P2002', clientVersion: 'test' });
  }

  const prismaMock = {
    medicine: {
      findUnique: async ({ where }: { where: { id: string } }) => medicines.find((m) => m.id === where.id) ?? null,
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = medicines.find((m) => m.id === where.id);
        if (!row) throw new Error('not found');
        Object.assign(row, data);
        return { ...row };
      },
    },
    medicineVariant: {
      findFirst: async ({ where }: { where: { id: string; medicineId: string } }) =>
        variants.find((v) => v.id === where.id && v.medicineId === where.medicineId) ?? null,
      create: async ({ data }: { data: Omit<VariantRow, 'id'> }) => {
        if (variants.some((v) => v.medicineId === data.medicineId && v.label === data.label)) {
          p2002(`Unique constraint failed on the fields: (\`medicineId\`,\`label\`)`);
        }
        const row: VariantRow = { id: `variant${nextVariantId++}`, ...data };
        variants.push(row);
        return { ...row };
      },
      update: async ({ where, data }: { where: { id: string }; data: Record<string, unknown> }) => {
        const row = variants.find((v) => v.id === where.id);
        if (!row) throw new Error('not found');
        if (typeof data.label === 'string' && variants.some((v) => v.id !== row.id && v.medicineId === row.medicineId && v.label === data.label)) {
          p2002(`Unique constraint failed on the fields: (\`medicineId\`,\`label\`)`);
        }
        Object.assign(row, data);
        return { ...row };
      },
      delete: async ({ where }: { where: { id: string } }) => {
        const index = variants.findIndex((v) => v.id === where.id);
        if (index === -1) throw new Error('not found');
        const [row] = variants.splice(index, 1);
        return row;
      },
    },
    auditEvent: {
      create: async ({ data }: { data: Record<string, unknown> }) => {
        auditEvents.push(data);
        return data;
      },
    },
  };

  return { medicines, variants, auditEvents, prismaMock };
});

vi.mock('../../packages/domain/src/lib/db', () => ({ prisma: h.prismaMock }));

import { ConflictError, NotFoundError } from '@abies/domain/lib/errors';
import {
  createProductVariant,
  removeProductVariant,
  updateAdminProduct,
  updateProductVariant,
} from '@abies/domain/modules/medicines/admin-products.service';

function seedMedicine(overrides: Partial<MedicineRow> = {}): MedicineRow {
  const row: MedicineRow = {
    id: `med${h.medicines.length + 1}`,
    name: 'Chyawanprash',
    genericName: null,
    brandName: null,
    category: 'Immunity',
    mrp: 300,
    imageUrl: null,
    active: true,
    requiresPrescription: false,
    ...overrides,
  };
  h.medicines.push(row);
  return row;
}

beforeEach(() => {
  h.medicines.length = 0;
  h.variants.length = 0;
  h.auditEvents.length = 0;
});

describe('updateAdminProduct', () => {
  it('updates only the fields present in the dto, leaving the rest untouched', async () => {
    const medicine = seedMedicine({ name: 'Original', mrp: 100 });

    const updated = await updateAdminProduct(medicine.id, { mrp: 250 }, null, { userId: 'admin1' });

    expect(updated.mrp).toBe(250);
    expect(updated.name).toBe('Original');
  });

  it('clears a nullable field when the dto explicitly sends null', async () => {
    const medicine = seedMedicine({ category: 'Immunity' });

    const updated = await updateAdminProduct(medicine.id, { category: null }, null, { userId: 'admin1' });

    expect(updated.category).toBeNull();
  });

  it('flips active/inactive — the publish control the audit flagged as missing', async () => {
    const medicine = seedMedicine({ active: true });

    const updated = await updateAdminProduct(medicine.id, { active: false }, null, { userId: 'admin1' });

    expect(updated.active).toBe(false);
  });

  it('throws NotFoundError for a product that does not exist', async () => {
    await expect(updateAdminProduct('missing', { name: 'X' }, null, { userId: 'admin1' })).rejects.toThrow(NotFoundError);
  });

  it('records a PRODUCT_UPDATED audit event naming the changed fields', async () => {
    const medicine = seedMedicine();

    await updateAdminProduct(medicine.id, { mrp: 500, active: false }, null, { userId: 'admin1' });

    expect(h.auditEvents).toHaveLength(1);
    expect(h.auditEvents[0]).toMatchObject({
      eventType: 'CATALOGUE',
      action: 'PRODUCT_UPDATED',
      resourceId: medicine.id,
      metadata: { fields: ['mrp', 'active'], hasNewImage: false },
    });
  });
});

describe('product variant CRUD', () => {
  it('creates a variant with default sortOrder/active and audits it', async () => {
    const medicine = seedMedicine();

    const variant = await createProductVariant(medicine.id, { label: '250gm' }, { userId: 'admin1' });

    expect(variant).toMatchObject({ medicineId: medicine.id, label: '250gm', sortOrder: 0, active: true });
    expect(h.auditEvents[0]).toMatchObject({ action: 'PRODUCT_VARIANT_CREATED', resourceId: variant.id });
  });

  it('throws NotFoundError when the product does not exist', async () => {
    await expect(createProductVariant('missing', { label: '250gm' }, { userId: 'admin1' })).rejects.toThrow(NotFoundError);
  });

  it('throws ConflictError for a duplicate label on the same product', async () => {
    const medicine = seedMedicine();
    await createProductVariant(medicine.id, { label: '1kg' }, { userId: 'admin1' });

    await expect(createProductVariant(medicine.id, { label: '1kg' }, { userId: 'admin1' })).rejects.toThrow(ConflictError);
  });

  it('allows the same label on two different products', async () => {
    const medicineA = seedMedicine();
    const medicineB = seedMedicine();
    await createProductVariant(medicineA.id, { label: '1kg' }, { userId: 'admin1' });

    await expect(createProductVariant(medicineB.id, { label: '1kg' }, { userId: 'admin1' })).resolves.toMatchObject({ label: '1kg' });
  });

  it('renames and deactivates a variant', async () => {
    const medicine = seedMedicine();
    const variant = await createProductVariant(medicine.id, { label: '250gm' }, { userId: 'admin1' });

    const renamed = await updateProductVariant(medicine.id, variant.id, { label: '500gm' }, { userId: 'admin1' });
    expect(renamed.label).toBe('500gm');

    const deactivated = await updateProductVariant(medicine.id, variant.id, { active: false }, { userId: 'admin1' });
    expect(deactivated.active).toBe(false);
  });

  it("scopes updates to the product a variant belongs to — another product's id 404s", async () => {
    const medicineA = seedMedicine();
    const medicineB = seedMedicine();
    const variant = await createProductVariant(medicineA.id, { label: '250gm' }, { userId: 'admin1' });

    await expect(updateProductVariant(medicineB.id, variant.id, { label: 'x' }, { userId: 'admin1' })).rejects.toThrow(NotFoundError);
  });

  it('removes a variant and audits it', async () => {
    const medicine = seedMedicine();
    const variant = await createProductVariant(medicine.id, { label: '250gm' }, { userId: 'admin1' });

    await removeProductVariant(medicine.id, variant.id, { userId: 'admin1' });

    expect(h.variants).toHaveLength(0);
    expect(h.auditEvents[1]).toMatchObject({ action: 'PRODUCT_VARIANT_REMOVED', resourceId: variant.id });
  });

  it('throws NotFoundError removing a variant that is already gone', async () => {
    const medicine = seedMedicine();
    await expect(removeProductVariant(medicine.id, 'missing', { userId: 'admin1' })).rejects.toThrow(NotFoundError);
  });
});
