import Link from 'next/link';
import { MedicineOrderStatusBadge } from '@abies/design-system/components/ui/badge';
import { DataTable, type DataTableColumn } from '@abies/design-system/components/ui/data-table';
import { listMineAsPharmacy } from '@abies/domain/modules/medicines/orders.service';
import { requireSessionOrRedirect } from '@abies/domain/server/current-user';

type OrderRow = Awaited<ReturnType<typeof listMineAsPharmacy>>[number];

const COLUMNS: DataTableColumn<OrderRow>[] = [
  {
    key: 'patient',
    label: 'Patient',
    render: (o) => (
      <Link href={`/partner/pharmacy/orders/${o.id}`} className="font-medium text-brand-purple-700 hover:underline">
        {[o.patientUser.patientProfile?.firstName, o.patientUser.patientProfile?.lastName].filter(Boolean).join(' ') ||
          o.patientUser.mobile}
      </Link>
    ),
  },
  {
    key: 'items',
    label: 'Items',
    render: (o) => <span className="text-sm text-brand-neutral-600">{o.items.map((i) => `${i.medicine.name} ×${i.quantity}`).join(', ')}</span>,
  },
  {
    key: 'placed',
    label: 'Placed',
    render: (o) => new Date(o.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }),
  },
  { key: 'status', label: 'Status', render: (o) => <MedicineOrderStatusBadge status={o.status} /> },
];

// EXPANSION-1d — table layout for a high-volume ops screen (matches
// docs/EXPANSION-1-VISUAL-GAP-ANALYSIS.md #12), same DataTable component
// already used by patient/payments and pharmacy/inventory rather than the
// card-list pattern patient-facing catalogue pages use.
export default async function PharmacyOrdersPage() {
  const session = await requireSessionOrRedirect();
  const orders = await listMineAsPharmacy(session.userId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Orders</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">Patient orders against your inventory.</p>

      <DataTable columns={COLUMNS} rows={orders} rowKey={(o) => o.id} emptyMessage="No orders yet." />
    </div>
  );
}
