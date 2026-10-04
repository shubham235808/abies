'use client';

import { useState } from 'react';
import Link from 'next/link';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Badge, MedicineOrderStatusBadge } from '@abies/design-system/components/ui/badge';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { Input, Label, Select } from '@abies/design-system/components/ui/input';
import { api, ApiError } from '@abies/design-system/api-client';
import { loadRazorpayScript } from '../../../lib/razorpay-checkout';

type PrescriptionItem = { id: string; productName: string; dosage: string | null; frequency: string | null };
type Prescription = { id: string; doctorName: string; finalizedAt: string | null; items: PrescriptionItem[] };
type Pharmacy = { id: string; name: string | null; serviceAreas: string[] };
type OrderItem = { medicineId: string; name: string; hasReview: boolean };
type Order = {
  id: string;
  status: string;
  createdAt: string;
  pharmacyName: string | null;
  itemNames: string[];
  items: OrderItem[];
  shipment: { carrier: string | null; trackingRef: string | null; dispatchedAt: string | null; deliveredAt: string | null } | null;
};

const CANCELLABLE = new Set(['PENDING', 'ACCEPTED']);

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  return (
    <div role="radiogroup" aria-label="Rating" className="flex gap-1">
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} star${n === 1 ? '' : 's'}`}
          onClick={() => onChange(n)}
          className={n <= value ? 'text-lg text-brand-purple-600' : 'text-lg text-brand-neutral-300'}
        >
          ★
        </button>
      ))}
    </div>
  );
}

function MedicineReviewForm({ orderId, medicineId, medicineName, onSubmitted }: { orderId: string; medicineId: string; medicineName: string; onSubmitted: () => void }) {
  const [rating, setRating] = useState(5);
  const [comment, setComment] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [open, setOpen] = useState(false);

  async function submit() {
    setSubmitting(true);
    setError(null);
    try {
      await api.post(`/api/v1/medicine-orders/${orderId}/review`, { medicineId, rating, comment: comment || undefined });
      onSubmitted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not submit your review.');
    } finally {
      setSubmitting(false);
    }
  }

  if (!open) {
    return (
      <Button variant="ghost" size="sm" onClick={() => setOpen(true)}>
        Review {medicineName}
      </Button>
    );
  }

  return (
    <div className="space-y-2">
      {error && <Alert tone="error">{error}</Alert>}
      <StarPicker value={rating} onChange={setRating} />
      <Input placeholder="Your review (optional)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <div className="flex gap-2">
        <Button variant="secondary" size="sm" onClick={() => setOpen(false)}>
          Never mind
        </Button>
        <Button size="sm" loading={submitting} onClick={submit}>
          Submit review
        </Button>
      </div>
    </div>
  );
}

export function MedicinesDashboard({
  prescriptions,
  pharmacies,
  initialOrders,
}: {
  prescriptions: Prescription[];
  pharmacies: Pharmacy[];
  initialOrders: Order[];
}) {
  const [orders, setOrders] = useState(initialOrders);
  const [cancellingId, setCancellingId] = useState<string | null>(null);
  const [listError, setListError] = useState<string | null>(null);

  async function handleCancel(id: string) {
    setCancellingId(id);
    setListError(null);
    try {
      const { order } = await api.post<{ order: { status: string } }>(`/api/v1/medicine-orders/${id}/cancel`, {});
      setOrders((prev) => prev.map((o) => (o.id === id ? { ...o, status: order.status } : o)));
    } catch (err) {
      setListError(err instanceof ApiError ? err.message : 'Could not cancel this order.');
    } finally {
      setCancellingId(null);
    }
  }

  function handleOrderPlaced(order: Order) {
    setOrders((prev) => [order, ...prev]);
  }

  function handleItemReviewed(orderId: string, medicineId: string) {
    setOrders((prev) =>
      prev.map((o) =>
        o.id === orderId ? { ...o, items: o.items.map((i) => (i.medicineId === medicineId ? { ...i, hasReview: true } : i)) } : o,
      ),
    );
  }

  return (
    <div>
      {prescriptions.length > 0 && (
        <div className="mt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Your prescriptions</h2>
          <div className="mt-3 space-y-3">
            {prescriptions.map((p) => (
              <PrescriptionCard key={p.id} prescription={p} pharmacies={pharmacies} onOrderPlaced={handleOrderPlaced} />
            ))}
          </div>
        </div>
      )}

      <div className="mt-8">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-brand-neutral-400">Your orders</h2>
        {listError && (
          <Alert tone="error" className="mt-3">
            {listError}
          </Alert>
        )}
        {orders.length === 0 ? (
          <p className="mt-3 text-sm text-brand-neutral-500">No orders yet.</p>
        ) : (
          <div className="mt-3 space-y-3">
            {orders.map((o) => (
              <Card key={o.id}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <p className="font-medium text-brand-neutral-900">{o.itemNames.join(', ') || 'Order'}</p>
                    <p className="mt-1 text-sm text-brand-neutral-600">{o.pharmacyName}</p>
                    <p className="mt-1 text-xs text-brand-neutral-400">
                      {new Date(o.createdAt).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' })}
                    </p>
                  </div>
                  <MedicineOrderStatusBadge status={o.status} />
                </div>

                {o.shipment && (o.shipment.carrier || o.shipment.trackingRef) && (
                  <p className="mt-2 text-xs text-brand-neutral-500">
                    Shipped via {o.shipment.carrier ?? 'courier'}
                    {o.shipment.trackingRef ? ` — ${o.shipment.trackingRef}` : ''}
                  </p>
                )}

                {o.status === 'DELIVERED' && o.items.length > 0 && (
                  <div className="mt-3 space-y-2 border-t border-brand-neutral-100 pt-3">
                    {[...new Map(o.items.map((i) => [i.medicineId, i])).values()].map((item) =>
                      item.hasReview ? (
                        <p key={item.medicineId} className="text-sm text-brand-neutral-500">
                          You reviewed {item.name}. Thank you!
                        </p>
                      ) : (
                        <MedicineReviewForm
                          key={item.medicineId}
                          orderId={o.id}
                          medicineId={item.medicineId}
                          medicineName={item.name}
                          onSubmitted={() => handleItemReviewed(o.id, item.medicineId)}
                        />
                      ),
                    )}
                  </div>
                )}

                {CANCELLABLE.has(o.status) && (
                  <div className="mt-3 border-t border-brand-neutral-100 pt-3">
                    <Button variant="ghost" size="sm" loading={cancellingId === o.id} onClick={() => handleCancel(o.id)}>
                      Cancel order
                    </Button>
                  </div>
                )}
              </Card>
            ))}
          </div>
        )}
      </div>

      <p className="mt-8 text-sm text-brand-neutral-600">
        Need something over the counter?{' '}
        <Link href="/medicines" className="font-medium text-brand-purple-700 underline">
          Browse medicines
        </Link>
        .
      </p>
    </div>
  );
}

type Match = { prescriptionItemId: string; productName: string; medicineId: string | null; available: boolean; quantityAvailable: number; price: number | null };

function PrescriptionCard({
  prescription,
  pharmacies,
  onOrderPlaced,
}: {
  prescription: Prescription;
  pharmacies: Pharmacy[];
  onOrderPlaced: (order: Order) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [pharmacyId, setPharmacyId] = useState('');
  const [matches, setMatches] = useState<Match[] | null>(null);
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [loadingMatch, setLoadingMatch] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function handlePharmacyChange(id: string) {
    setPharmacyId(id);
    setMatches(null);
    setError(null);
    if (!id) return;
    setLoadingMatch(true);
    try {
      const { items } = await api.get<{ items: Match[] }>(`/api/v1/prescriptions/${prescription.id}/match?pharmacyId=${id}`);
      setMatches(items);
      setQuantities(Object.fromEntries(items.filter((i) => i.available).map((i) => [i.medicineId as string, 1])));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not check this pharmacy.');
    } finally {
      setLoadingMatch(false);
    }
  }

  const availableMatches = (matches ?? []).filter((m) => m.available && m.medicineId);
  const total = availableMatches.reduce((sum, m) => sum + (m.price ?? 0) * (quantities[m.medicineId as string] ?? 0), 0);

  async function handleOrder() {
    if (!address) {
      setError('Delivery address is required');
      return;
    }
    const items = availableMatches
      .map((m) => ({ medicineId: m.medicineId as string, quantity: quantities[m.medicineId as string] ?? 0 }))
      .filter((i) => i.quantity > 0);
    if (items.length === 0) {
      setError('Select at least one item to order');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.post<{
        order: { id: string };
        razorpayOrder: { id: string; amount: number; currency: string };
        razorpayKeyId: string;
      }>('/api/v1/medicine-orders', {
        pharmacyId,
        prescriptionId: prescription.id,
        deliveryAddress: address,
        items,
      });

      await loadRazorpayScript();
      if (!window.Razorpay) throw new Error('Payment provider script did not load');

      const pharmacy = pharmacies.find((p) => p.id === pharmacyId);
      const checkout = new window.Razorpay({
        key: result.razorpayKeyId,
        amount: result.razorpayOrder.amount,
        currency: result.razorpayOrder.currency,
        order_id: result.razorpayOrder.id,
        name: 'ABIES',
        description: `Prescription order — ${pharmacy?.name ?? 'Pharmacy'}`,
        theme: { color: '#7A1783' },
        handler: async (response) => {
          try {
            await api.post('/api/v1/medicine-orders/verify-payment', {
              orderId: result.order.id,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            onOrderPlaced({
              id: result.order.id,
              status: 'PENDING',
              createdAt: new Date().toISOString(),
              pharmacyName: pharmacy?.name ?? null,
              itemNames: availableMatches.map((m) => m.productName),
              items: [],
              shipment: null,
            });
            setExpanded(false);
            setMatches(null);
            setPharmacyId('');
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Payment succeeded but confirmation failed — contact support.');
          }
        },
        modal: { ondismiss: () => setSubmitting(false) },
      });
      checkout.open();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start order.');
      setSubmitting(false);
    }
  }

  return (
    <Card>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="font-medium text-brand-neutral-900">Prescribed by {prescription.doctorName}</p>
          <ul className="mt-1 space-y-0.5 text-sm text-brand-neutral-600">
            {prescription.items.map((item) => (
              <li key={item.id}>
                {item.productName}
                {item.dosage ? ` — ${item.dosage}` : ''}
                {item.frequency ? `, ${item.frequency}` : ''}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-brand-neutral-400">
            {prescription.finalizedAt ? new Date(prescription.finalizedAt).toLocaleDateString() : ''}
          </p>
        </div>
        {!expanded && (
          <Button variant="secondary" size="sm" onClick={() => setExpanded(true)}>
            Order from a pharmacy
          </Button>
        )}
      </div>

      {expanded && (
        <div className="mt-4 space-y-3 border-t border-brand-neutral-100 pt-4">
          {error && <Alert tone="error">{error}</Alert>}
          <div>
            <Label htmlFor={`pharmacy-${prescription.id}`}>Pharmacy</Label>
            <Select id={`pharmacy-${prescription.id}`} value={pharmacyId} onChange={(e) => handlePharmacyChange(e.target.value)}>
              <option value="">Choose a pharmacy…</option>
              {pharmacies.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name ?? 'Pharmacy'} ({p.serviceAreas.join(', ') || 'no areas set'})
                </option>
              ))}
            </Select>
          </div>

          {loadingMatch && <p className="text-sm text-brand-neutral-500">Checking availability…</p>}

          {matches && (
            <div className="space-y-2">
              {matches.map((m) => (
                <div key={m.prescriptionItemId} className="flex items-center justify-between gap-3 text-sm">
                  <span className={m.available ? 'text-brand-neutral-800' : 'text-brand-neutral-400 line-through'}>
                    {m.productName}
                    {!m.available && ' (not stocked here)'}
                  </span>
                  {m.available && m.medicineId && (
                    <div className="flex items-center gap-2">
                      <Input
                        type="number"
                        min={1}
                        max={m.quantityAvailable}
                        className="w-20"
                        value={quantities[m.medicineId] ?? 1}
                        onChange={(e) =>
                          setQuantities((prev) => ({ ...prev, [m.medicineId as string]: Number(e.target.value) }))
                        }
                      />
                      <Badge tone="blue">₹{m.price}</Badge>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {availableMatches.length > 0 && (
            <>
              <div>
                <Label htmlFor={`address-${prescription.id}`}>Delivery address</Label>
                <Input id={`address-${prescription.id}`} value={address} onChange={(e) => setAddress(e.target.value)} />
              </div>
              <Button size="sm" loading={submitting} onClick={handleOrder}>
                Order & pay ₹{total}
              </Button>
            </>
          )}
        </div>
      )}
    </Card>
  );
}
