'use client';

import { useState } from 'react';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { Input, Label } from '@abies/design-system/components/ui/input';
import { api, ApiError } from '@abies/design-system/api-client';

type Shipment = { carrier: string | null; trackingRef: string | null; dispatchedAt: string | null; deliveredAt: string | null };

// Same lesson as src/app/lab/orders/[id]/order-actions.tsx (Phase 7): a
// Client Component's useState only takes its initial value from props at
// mount and never re-syncs on its own, so every action here updates this
// state directly from that action's own response rather than relying on
// router.refresh() to somehow flow new server data back in.
export function OrderActions({ orderId, status: initialStatus, shipment: initialShipment }: { orderId: string; status: string; shipment: Shipment | null }) {
  const [status, setStatus] = useState(initialStatus);
  const [shipment, setShipment] = useState(initialShipment);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleAccept() {
    setBusy(true);
    setError(null);
    try {
      const { order } = await api.post<{ order: { status: string } }>(`/api/v1/pharmacies/me/orders/${orderId}/accept`, {});
      setStatus(order.status);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not accept this order.');
    } finally {
      setBusy(false);
    }
  }

  async function handlePacking() {
    setBusy(true);
    setError(null);
    try {
      const { order } = await api.post<{ order: { status: string } }>(`/api/v1/pharmacies/me/orders/${orderId}/packing`, {});
      setStatus(order.status);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this order.');
    } finally {
      setBusy(false);
    }
  }

  async function handleCancel() {
    setBusy(true);
    setError(null);
    try {
      const { order } = await api.post<{ order: { status: string } }>(`/api/v1/medicine-orders/${orderId}/cancel`, {
        reason: 'Cancelled by pharmacy',
      });
      setStatus(order.status);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not cancel this order.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card className="mt-6">
      <h2 className="font-semibold text-brand-neutral-900">Fulfilment</h2>
      {error && (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      )}

      {status === 'PENDING' && (
        <div className="mt-3 flex flex-wrap gap-3">
          <Button loading={busy} onClick={handleAccept}>
            Accept order
          </Button>
          <Button variant="ghost" loading={busy} onClick={handleCancel}>
            Reject order
          </Button>
        </div>
      )}

      {status === 'ACCEPTED' && (
        <div className="mt-3 flex flex-wrap gap-3">
          <Button loading={busy} onClick={handlePacking}>
            Start packing
          </Button>
          <Button variant="ghost" loading={busy} onClick={handleCancel}>
            Cancel order
          </Button>
        </div>
      )}

      {status === 'PACKING' && (
        <DispatchForm
          orderId={orderId}
          onDispatched={(s) => {
            setStatus('DISPATCHED');
            setShipment(s);
          }}
        />
      )}

      {status === 'DISPATCHED' && (
        <DeliveredButton
          orderId={orderId}
          shipment={shipment}
          onDelivered={() => setStatus('DELIVERED')}
        />
      )}

      {status === 'DELIVERED' && shipment && (
        <p className="mt-3 text-sm text-brand-neutral-600">
          Delivered {shipment.deliveredAt ? new Date(shipment.deliveredAt).toLocaleString() : ''}
          {shipment.carrier ? ` via ${shipment.carrier}` : ''}
          {shipment.trackingRef ? ` (${shipment.trackingRef})` : ''}
        </p>
      )}

      {status === 'CANCELLED' && <p className="mt-3 text-sm text-brand-neutral-500">This order was cancelled.</p>}
    </Card>
  );
}

function DispatchForm({ orderId, onDispatched }: { orderId: string; onDispatched: (shipment: Shipment) => void }) {
  const [carrier, setCarrier] = useState('');
  const [trackingRef, setTrackingRef] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/api/v1/pharmacies/me/orders/${orderId}/dispatch`, {
        carrier: carrier || undefined,
        trackingRef: trackingRef || undefined,
      });
      onDispatched({ carrier: carrier || null, trackingRef: trackingRef || null, dispatchedAt: new Date().toISOString(), deliveredAt: null });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not mark this order dispatched.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="mt-3 space-y-3">
      {error && <Alert tone="error">{error}</Alert>}
      <div>
        <Label htmlFor="carrier">Carrier</Label>
        <Input id="carrier" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
      </div>
      <div>
        <Label htmlFor="trackingRef">Tracking reference</Label>
        <Input id="trackingRef" value={trackingRef} onChange={(e) => setTrackingRef(e.target.value)} />
      </div>
      <Button loading={submitting} onClick={handleSubmit}>
        Mark dispatched
      </Button>
    </div>
  );
}

function DeliveredButton({ orderId, shipment, onDelivered }: { orderId: string; shipment: Shipment | null; onDelivered: () => void }) {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function handleClick() {
    setBusy(true);
    setError(null);
    try {
      await api.post(`/api/v1/pharmacies/me/orders/${orderId}/delivered`, {});
      onDelivered();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not mark this order delivered.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="mt-3 space-y-2">
      {error && <Alert tone="error">{error}</Alert>}
      {shipment?.carrier && (
        <p className="text-sm text-brand-neutral-600">
          Dispatched via {shipment.carrier}
          {shipment.trackingRef ? ` (${shipment.trackingRef})` : ''}
        </p>
      )}
      <Button loading={busy} onClick={handleClick}>
        Mark delivered
      </Button>
    </div>
  );
}
