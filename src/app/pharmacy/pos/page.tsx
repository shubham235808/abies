import Link from 'next/link';
import { listMyInventory } from '@/modules/medicines/catalogue.service';
import { getMyTaxSettings } from '@/modules/medicines/pharmacies.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { PosTerminal } from './pos-terminal';

export default async function PharmacyPosPage() {
  const session = await requireSessionOrRedirect();
  const [inventory, taxSettings] = await Promise.all([listMyInventory(session.userId), getMyTaxSettings(session.userId)]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-brand-neutral-900">POS</h1>
          <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">
            Record a walk-in counter sale. GST is computed automatically from each item&apos;s HSN code.
          </p>
        </div>
        <Link href="/pharmacy/pos/sales" className="text-sm font-medium text-brand-purple-600">
          View sales →
        </Link>
      </div>

      {!taxSettings || !taxSettings.active ? (
        <div className="mt-6 rounded-card border border-brand-orange-200 bg-brand-orange-50 p-5 text-sm text-brand-orange-800">
          Set up <a href="/pharmacy/tax-settings" className="font-medium underline">Tax Settings</a> before recording a sale.
        </div>
      ) : (
        <div className="mt-6">
          <PosTerminal
            inventory={inventory
              .filter((row) => row.quantityAvailable > 0)
              .map((row) => ({
                medicineId: row.medicineId,
                medicineName: row.medicine.name,
                batchNumber: row.batchNumber,
                quantityAvailable: row.quantityAvailable,
                price: row.price,
                hsnCode: row.medicine.hsnCode,
                expiryDate: row.expiryDate.toISOString(),
              }))}
          />
        </div>
      )}
    </div>
  );
}
