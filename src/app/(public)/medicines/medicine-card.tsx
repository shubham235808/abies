'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input, Label, Select } from '@/components/ui/input';
import { RatingBadge } from '@/components/ui/rating';
import { useToast } from '@/components/ui/toast';
import { api, ApiError } from '@/lib/api-client';
import { loadRazorpayScript } from '@/lib/razorpay-checkout';
import type { PublicMedicineListing } from '@/modules/medicines/catalogue.service';

export function MedicineCard({ medicine, viewerRole }: { medicine: PublicMedicineListing; viewerRole: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const hasVariants = medicine.variants.length > 1;
  const [selectedVariantId, setSelectedVariantId] = useState<string | null>(medicine.variants[0]?.variantId ?? null);
  const selectedVariant = medicine.variants.find((v) => v.variantId === selectedVariantId) ?? medicine.variants[0];
  const unitPrice = selectedVariant?.price ?? medicine.price;
  const availableQuantity = selectedVariant?.quantityAvailable ?? medicine.quantityAvailable;

  const [ordering, setOrdering] = useState(false);
  const [quantity, setQuantity] = useState(1);
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [addingToCart, setAddingToCart] = useState(false);

  async function handleAddToCart() {
    setError(null);
    setAddingToCart(true);
    try {
      await api.post('/api/patients/me/cart', {
        pharmacyId: medicine.pharmacy.id,
        medicineId: medicine.medicineId,
        variantId: selectedVariantId ?? undefined,
        quantity,
      });
      toast.show(`Added ${medicine.name} to cart.`, 'success');
    } catch (err) {
      toast.show(err instanceof ApiError ? err.message : 'Could not add this to your cart.', 'danger');
    } finally {
      setAddingToCart(false);
    }
  }

  async function handleBookAndPay() {
    if (!address) {
      setError('Delivery address is required');
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      const result = await api.post<{
        order: { id: string };
        razorpayOrder: { id: string; amount: number; currency: string };
        razorpayKeyId: string;
      }>('/api/medicine-orders', {
        pharmacyId: medicine.pharmacy.id,
        deliveryAddress: address,
        items: [{ medicineId: medicine.medicineId, variantId: selectedVariantId ?? undefined, quantity }],
      });

      await loadRazorpayScript();
      if (!window.Razorpay) throw new Error('Payment provider script did not load');

      const checkout = new window.Razorpay({
        key: result.razorpayKeyId,
        amount: result.razorpayOrder.amount,
        currency: result.razorpayOrder.currency,
        order_id: result.razorpayOrder.id,
        name: 'ABIES',
        description: `${medicine.name} — ${medicine.pharmacy.name ?? 'Pharmacy'}`,
        theme: { color: '#7A1783' },
        handler: async (response) => {
          try {
            await api.post('/api/medicine-orders/verify-payment', {
              orderId: result.order.id,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            router.push('/patient/medicines');
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
      {medicine.imageUrl && (
        <div className="relative -mx-6 -mt-6 mb-3 aspect-square overflow-hidden rounded-t-card bg-brand-neutral-50">
          <Image
            src={medicine.imageUrl}
            alt={medicine.name}
            fill
            sizes="(min-width: 1024px) 240px, 45vw"
            className="object-contain p-4"
          />
        </div>
      )}
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-brand-neutral-900">{medicine.name}</h3>
          <p className="text-xs text-brand-neutral-500">
            {[medicine.form, medicine.strength].filter(Boolean).join(' · ')} · {medicine.pharmacy.name ?? 'Pharmacy'}
          </p>
          <div className="mt-1">
            <RatingBadge rating={medicine.rating} reviewCount={medicine.reviewCount} />
          </div>
        </div>
        <Badge tone="blue">₹{unitPrice}</Badge>
      </div>
      <p className="mt-2 text-xs text-brand-neutral-400">{availableQuantity} in stock</p>

      {hasVariants && (
        <div className="mt-3">
          <Label htmlFor={`variant-${medicine.medicineId}`}>Pack size</Label>
          <Select
            id={`variant-${medicine.medicineId}`}
            value={selectedVariantId ?? ''}
            onChange={(e) => setSelectedVariantId(e.target.value || null)}
          >
            {medicine.variants.map((v) => (
              <option key={v.variantId ?? 'default'} value={v.variantId ?? ''}>
                {v.label ?? 'Standard'} — ₹{v.price}
              </option>
            ))}
          </Select>
        </div>
      )}

      {viewerRole !== 'PATIENT' ? (
        <div className="mt-3 text-sm text-brand-neutral-500">
          {viewerRole ? (
            'Only patients can order medicines.'
          ) : (
            <>
              <Link href="/login" className="font-medium text-brand-purple-700 underline">
                Log in as a patient
              </Link>{' '}
              to order this.
            </>
          )}
        </div>
      ) : ordering ? (
        <div className="mt-3 space-y-3 border-t border-brand-neutral-100 pt-3">
          {error && <Alert tone="error">{error}</Alert>}
          <div>
            <Label htmlFor={`qty-${medicine.medicineId}`}>Quantity</Label>
            <Input
              id={`qty-${medicine.medicineId}`}
              type="number"
              min={1}
              max={availableQuantity}
              value={quantity}
              onChange={(e) => setQuantity(Number(e.target.value))}
            />
          </div>
          <div>
            <Label htmlFor={`address-${medicine.medicineId}`}>Delivery address</Label>
            <Input id={`address-${medicine.medicineId}`} value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
          <Button size="sm" loading={submitting} onClick={handleBookAndPay}>
            Order & pay ₹{unitPrice * quantity}
          </Button>
        </div>
      ) : (
        <div className="mt-3 flex gap-2">
          <Button variant="secondary" size="sm" onClick={() => setOrdering(true)}>
            Order
          </Button>
          <Button variant="ghost" size="sm" loading={addingToCart} onClick={handleAddToCart}>
            Add to cart
          </Button>
        </div>
      )}
    </Card>
  );
}
