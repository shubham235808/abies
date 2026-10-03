import Link from 'next/link';
import { listMineAsLab } from '@abies/domain/modules/diagnostics/orders.service';
import { requireSessionOrRedirect } from '@abies/domain/server/current-user';

const STATUS_LABEL: Record<string, string> = {
  SCHEDULED: 'Scheduled',
  SAMPLE_COLLECTED: 'Sample collected',
  PROCESSING: 'Processing',
  COMPLETED: 'Completed',
  CANCELLED: 'Cancelled',
};

export default async function LabOrdersPage() {
  const session = await requireSessionOrRedirect();
  const orders = await listMineAsLab(session.userId);

  return (
    <div>
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Orders</h1>
      <p className="mt-1 max-w-2xl text-sm text-brand-neutral-600">Patient bookings against your test catalogue.</p>

      {orders.length === 0 ? (
        <p className="mt-6 text-sm text-brand-neutral-500">No orders yet.</p>
      ) : (
        <div className="mt-6 space-y-3">
          {orders.map((o) => {
            const patientName =
              [o.patientUser.patientProfile?.firstName, o.patientUser.patientProfile?.lastName].filter(Boolean).join(' ') ||
              o.patientUser.mobile;
            return (
              <Link key={o.id} href={`/partner/lab/orders/${o.id}`}>
                <div className="flex flex-wrap items-start justify-between gap-3 rounded-card border border-brand-neutral-200 bg-white p-4 shadow-sm transition-colors hover:border-brand-purple-300">
                  <div>
                    <p className="font-medium text-brand-neutral-900">{patientName}</p>
                    <p className="mt-1 text-sm text-brand-neutral-600">
                      {o.items.map((i) => i.test?.name ?? i.package?.name).filter(Boolean).join(', ')}
                    </p>
                    <p className="mt-1 text-xs text-brand-neutral-400">
                      {o.scheduledAt ? new Date(o.scheduledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not scheduled'} ·{' '}
                      {o.collectionMode === 'HOME' ? 'Home collection' : 'Lab visit'}
                    </p>
                  </div>
                  <span className="rounded-full bg-brand-blue-50 px-2.5 py-0.5 text-xs font-medium text-brand-blue-700">
                    {STATUS_LABEL[o.status] ?? o.status}
                  </span>
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
