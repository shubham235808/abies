import Link from 'next/link';
import { MedicineOrderStatusBadge } from '@/components/ui/badge';
import { listMineAsPharmacy } from '@/modules/medicines/orders.service';
import { requireSessionOrRedirect } from '@/server/current-user';

export default async function PharmacyOrdersPage() {
  const session = await requireSessionOrRedirect();
  const orders = await listMineAsPharmacy(session.userId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Orders</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">Patient orders against your inventory.</p>

      {orders.length === 0 ? (
        <p className="mt-6 text-sm text-brand-neutral-500">No orders yet.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {orders.map((o) => {
            const patientName =
              [o.patientUser.patientProfile?.firstName, o.patientUser.patientProfile?.lastName].filter(Boolean).join(' ') ||
              o.patientUser.mobile;
            return (
              <Link key={o.id} href={`/pharmacy/orders/${o.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-brand-neutral-200 bg-white p-4 shadow-sm transition-colors hover:border-brand-purple-300">
                  <div>
                    <p className="font-medium text-brand-neutral-900">{patientName}</p>
                    <p className="mt-1 text-sm text-brand-neutral-600">
                      {o.items.map((i) => `${i.medicine.name} ×${i.quantity}`).join(', ')}
                    </p>
                    <p className="mt-1 text-xs text-brand-neutral-400">
                      {new Date(o.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                  <MedicineOrderStatusBadge status={o.status} />
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
