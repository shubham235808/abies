import { notFound } from 'next/navigation';
import { Card } from '@/components/ui/card';
import { NotFoundError } from '@/lib/errors';
import { getOrder } from '@/modules/diagnostics/orders.service';
import { requireSessionOrRedirect } from '@/server/current-user';
import { OrderActions } from './order-actions';

export default async function LabOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSessionOrRedirect();
  const { id } = await params;

  let order;
  try {
    order = await getOrder(session.userId, session.user.role, id);
  } catch (err) {
    if (err instanceof NotFoundError) notFound();
    throw err;
  }

  const patientName =
    [order.patientUser.patientProfile?.firstName, order.patientUser.patientProfile?.lastName].filter(Boolean).join(' ') ||
    order.patientUser.mobile;

  return (
    <div className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-brand-neutral-900">Order — {patientName}</h1>
      <p className="mt-1 text-sm text-brand-neutral-600">
        {order.scheduledAt ? new Date(order.scheduledAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : 'Not scheduled'} ·{' '}
        {order.collectionMode === 'HOME' ? `Home collection — ${order.address ?? ''}` : 'Lab visit'}
      </p>

      <Card className="mt-6">
        <h2 className="font-semibold text-brand-neutral-900">Tests</h2>
        <ul className="mt-2 space-y-1 text-sm text-brand-neutral-700">
          {order.items.map((item) => (
            <li key={item.id}>
              {item.test?.name ?? 'Removed test'} — ₹{item.price}
            </li>
          ))}
        </ul>
      </Card>

      <OrderActions
        orderId={order.id}
        status={order.status}
        sampleCollection={
          order.sampleCollection
            ? {
                collectorName: order.sampleCollection.collectorName,
                collectedAt: order.sampleCollection.collectedAt?.toISOString() ?? null,
                sampleBarcode: order.sampleCollection.sampleBarcode,
              }
            : null
        }
        report={
          order.report
            ? { releasedToPatientAt: order.report.releasedToPatientAt?.toISOString() ?? null, criticalFlag: order.report.criticalFlag }
            : null
        }
      />
    </div>
  );
}
