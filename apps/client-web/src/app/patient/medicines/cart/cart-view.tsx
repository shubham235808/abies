'use client';

import { useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Badge } from '@abies/design-system/components/ui/badge';
import { Button } from '@abies/design-system/components/ui/button';
import { Card } from '@abies/design-system/components/ui/card';
import { Input, Label } from '@abies/design-system/components/ui/input';
import { api, ApiError } from '@abies/design-system/api-client';
import { loadRazorpayScript } from '../../../../lib/razorpay-checkout';

type CartItem = {
  id: string;
  medicineId: string;
  medicineName: string;
  imageUrl: string | null;
  variantId: string | null;
  variantLabel: string | null;
  quantity: number;
  unitPrice: number | null;
  available: boolean;
};

type Cart = {
  id: string;
  pharmacy: { id: string; name: string | null };
  status: string;
  items: CartItem[];
  subtotal: number;
};

export function CartView({ initialCarts }: { initialCarts: Cart[] }) {
  const [carts, setCarts] = useState(initialCarts);

  function handleCartUpdated(cart: Cart) {
    setCarts((prev) => (cart.items.length === 0 ? prev.filter((c) => c.id !== cart.id) : prev.map((c) => (c.id === cart.id ? cart : c))));
  }

  function handleCartCheckedOut(cartId: string) {
    setCarts((prev) => prev.filter((c) => c.id !== cartId));
  }

  if (carts.length === 0) {
    return (
      <p className="mt-8 text-sm text-brand-neutral-500">
        Your cart is empty.{' '}
        <Link href="/medicines" className="font-medium text-brand-purple-700 underline">
          Browse medicines
        </Link>
        .
      </p>
    );
  }

  return (
    <div className="mt-6 space-y-4">
      {carts.map((cart) => (
        <PharmacyCart key={cart.id} cart={cart} onUpdated={handleCartUpdated} onCheckedOut={handleCartCheckedOut} />
      ))}
    </div>
  );
}

function PharmacyCart({
  cart,
  onUpdated,
  onCheckedOut,
}: {
  cart: Cart;
  onUpdated: (cart: Cart) => void;
  onCheckedOut: (cartId: string) => void;
}) {
  const router = useRouter();
  const [address, setAddress] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [savingItemId, setSavingItemId] = useState<string | null>(null);
  const [checkingOut, setCheckingOut] = useState(false);

  const unavailableItems = cart.items.filter((i) => !i.available);
  const canCheckOut = cart.items.length > 0 && unavailableItems.length === 0;

  async function handleQuantityChange(item: CartItem, quantity: number) {
    setSavingItemId(item.id);
    setError(null);
    try {
      const { cart: updated } = await api.patch<{ cart: Cart }>(`/api/patients/me/cart/items/${item.id}`, { quantity });
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not update this item.');
    } finally {
      setSavingItemId(null);
    }
  }

  async function handleRemove(item: CartItem) {
    setSavingItemId(item.id);
    setError(null);
    try {
      const { cart: updated } = await api.delete<{ cart: Cart }>(`/api/patients/me/cart/items/${item.id}`);
      onUpdated(updated);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove this item.');
    } finally {
      setSavingItemId(null);
    }
  }

  async function handleCheckout() {
    if (!address) {
      setError('Delivery address is required');
      return;
    }
    setCheckingOut(true);
    setError(null);
    try {
      const result = await api.post<{
        order: { id: string };
        razorpayOrder: { id: string; amount: number; currency: string };
        razorpayKeyId: string;
      }>(`/api/patients/me/cart/${cart.id}/checkout`, { deliveryAddress: address });

      await loadRazorpayScript();
      if (!window.Razorpay) throw new Error('Payment provider script did not load');

      const checkout = new window.Razorpay({
        key: result.razorpayKeyId,
        amount: result.razorpayOrder.amount,
        currency: result.razorpayOrder.currency,
        order_id: result.razorpayOrder.id,
        name: 'ABIES',
        description: `${cart.pharmacy.name ?? 'Pharmacy'} order`,
        theme: { color: '#7A1783' },
        handler: async (response) => {
          try {
            await api.post('/api/medicine-orders/verify-payment', {
              orderId: result.order.id,
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature,
            });
            onCheckedOut(cart.id);
            router.push('/patient/medicines');
          } catch (err) {
            setError(err instanceof ApiError ? err.message : 'Payment succeeded but confirmation failed — contact support.');
          }
        },
        modal: { ondismiss: () => setCheckingOut(false) },
      });
      checkout.open();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not start checkout.');
      setCheckingOut(false);
    }
  }

  return (
    <Card>
      <h2 className="font-semibold text-brand-neutral-900">{cart.pharmacy.name ?? 'Pharmacy'}</h2>

      {error && (
        <Alert tone="error" className="mt-3">
          {error}
        </Alert>
      )}

      <div className="mt-3 space-y-3">
        {cart.items.map((item) => (
          <div key={item.id} className="flex items-center gap-3 border-t border-brand-neutral-100 pt-3 first:border-t-0 first:pt-0">
            {item.imageUrl && (
              <div className="relative h-14 w-14 shrink-0 overflow-hidden rounded-lg bg-brand-neutral-50">
                <Image src={item.imageUrl} alt={item.medicineName} fill sizes="56px" className="object-contain p-1" />
              </div>
            )}
            <div className="flex-1">
              <p className="text-sm font-medium text-brand-neutral-900">
                {item.medicineName}
                {item.variantLabel ? ` (${item.variantLabel})` : ''}
              </p>
              {item.available ? (
                <p className="text-xs text-brand-neutral-500">₹{item.unitPrice} each</p>
              ) : (
                <p className="text-xs text-brand-magenta-600">No longer in stock at this pharmacy</p>
              )}
            </div>
            <Input
              type="number"
              min={0}
              className="w-20"
              disabled={savingItemId === item.id}
              defaultValue={item.quantity}
              onBlur={(e) => {
                const next = Number(e.target.value);
                if (next !== item.quantity) handleQuantityChange(item, next);
              }}
            />
            <Button variant="ghost" size="sm" loading={savingItemId === item.id} onClick={() => handleRemove(item)}>
              Remove
            </Button>
          </div>
        ))}
      </div>

      <div className="mt-4 space-y-3 border-t border-brand-neutral-100 pt-4">
        <div className="flex items-center justify-between">
          <span className="text-sm text-brand-neutral-600">Subtotal</span>
          <Badge tone="blue">₹{cart.subtotal}</Badge>
        </div>
        {canCheckOut && (
          <div>
            <Label htmlFor={`address-${cart.id}`}>Delivery address</Label>
            <Input id={`address-${cart.id}`} value={address} onChange={(e) => setAddress(e.target.value)} />
          </div>
        )}
        <Button size="sm" loading={checkingOut} disabled={!canCheckOut} onClick={handleCheckout}>
          Checkout & pay ₹{cart.subtotal}
        </Button>
        {!canCheckOut && unavailableItems.length > 0 && (
          <p className="text-xs text-brand-neutral-500">Remove out-of-stock items to check out.</p>
        )}
      </div>
    </Card>
  );
}
