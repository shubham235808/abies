import { listMyInventory } from '@/modules/medicines/catalogue.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { InventoryManager } from './inventory-manager';

export default async function PharmacyInventoryPage() {
  const session = await requireSessionOrRedirect();
  const inventory = await listMyInventory(session.userId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Inventory</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
        Medicines you stock, by batch. Only OTC batches with quantity in stock appear on the public medicines
        catalogue; prescribed items are matched against a patient&apos;s prescription at order time.
      </p>
      <div className="mt-6">
        <InventoryManager
          initial={inventory.map((row) => ({
            id: row.id,
            batchNumber: row.batchNumber,
            expiryDate: row.expiryDate.toISOString(),
            quantityAvailable: row.quantityAvailable,
            price: row.price,
            medicine: {
              id: row.medicine.id,
              name: row.medicine.name,
              form: row.medicine.form,
              strength: row.medicine.strength,
              requiresPrescription: row.medicine.requiresPrescription,
              hsnCode: row.medicine.hsnCode,
              isFmcg: row.medicine.isFmcg,
            },
            variant: row.variant ? { label: row.variant.label } : null,
          }))}
        />
      </div>
    </div>
  );
}
