import { notFound } from 'next/navigation';
import { Card } from '@abies/design-system/components/ui/card';
import { NotFoundError } from '@abies/domain/lib/errors';
import { getOrder } from '@abies/domain/modules/medicines/orders.service';
import { requireSessionOrRedirect } from '@abies/domain/server/current-user';
import { OrderActions } from './order-actions';

export default async function PharmacyOrderPage({ params }: { params: Promise<{ id: string }> }) {
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
      <p className="mt-1 text-sm text-brand-neutral-600">Deliver to: {order.deliveryAddress}</p>

      <Card className="mt-6">
        <h2 className="font-semibold text-brand-neutral-900">Items</h2>
        <ul className="mt-2 space-y-1 text-sm text-brand-neutral-700">
          {order.items.map((item) => (
            <li key={item.id}>
              {item.medicine.name} ({item.batchNumber}) × {item.quantity} — ₹{item.unitPrice * item.quantity}
            </li>
          ))}
        </ul>
      </Card>

      <OrderActions
        orderId={order.id}
        status={order.status}
        shipment={
          order.shipment
            ? {
                carrier: order.shipment.carrier,
                trackingRef: order.shipment.trackingRef,
                dispatchedAt: order.shipment.dispatchedAt?.toISOString() ?? null,
                deliveredAt: order.shipment.deliveredAt?.toISOString() ?? null,
              }
            : null
        }
      />
    </div>
  );
}
