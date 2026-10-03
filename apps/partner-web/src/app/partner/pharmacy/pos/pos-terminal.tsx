'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@abies/design-system/components/ui/alert';
import { Button } from '@abies/design-system/components/ui/button';
import { Input, Label, Select } from '@abies/design-system/components/ui/input';
import { api, ApiError } from '@abies/design-system/api-client';

type InventoryLine = {
  medicineId: string;
  medicineName: string;
  batchNumber: string;
  quantityAvailable: number;
  price: number;
  hsnCode: string | null;
  expiryDate: string;
};

type CartLine = { medicineId: string; medicineName: string; batchNumber: string; unitPrice: number; maxQuantity: number; quantity: number };

const PAYMENT_METHODS = ['CASH', 'UPI', 'CARD', 'OTHER'] as const;

export function PosTerminal({ inventory }: { inventory: InventoryLine[] }) {
  const router = useRouter();
  const [query, setQuery] = useState('');
  const [cart, setCart] = useState<CartLine[]>([]);
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHODS)[number]>('CASH');
  const [upiReference, setUpiReference] = useState('');
  const [discountAmount, setDiscountAmount] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const matches = useMemo(() => {
    if (!query.trim()) return [];
    const q = query.trim().toLowerCase();
    return inventory.filter((row) => row.medicineName.toLowerCase().includes(q) || row.hsnCode?.includes(q)).slice(0, 8);
  }, [query, inventory]);

  function addToCart(row: InventoryLine) {
    setCart((prev) => {
      const existing = prev.find((l) => l.medicineId === row.medicineId && l.batchNumber === row.batchNumber);
      if (existing) {
        if (existing.quantity >= row.quantityAvailable) return prev;
        return prev.map((l) => (l === existing ? { ...l, quantity: l.quantity + 1 } : l));
      }
      return [...prev, { medicineId: row.medicineId, medicineName: row.medicineName, batchNumber: row.batchNumber, unitPrice: row.price, maxQuantity: row.quantityAvailable, quantity: 1 }];
    });
    setQuery('');
  }

  function updateQuantity(index: number, quantity: number) {
    setCart((prev) => prev.map((l, i) => (i === index ? { ...l, quantity: Math.max(1, Math.min(quantity, l.maxQuantity)) } : l)));
  }

  function removeLine(index: number) {
    setCart((prev) => prev.filter((_, i) => i !== index));
  }

  const subtotal = cart.reduce((sum, l) => sum + l.unitPrice * l.quantity, 0);

  async function handleCheckout() {
    if (cart.length === 0) {
      setError('Add at least one item.');
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const { sale } = await api.post<{ sale: { id: string } }>('/api/pharmacies/me/pos/sales', {
        customerName: customerName || undefined,
        customerPhone: customerPhone || undefined,
        paymentMethod,
        upiReference: paymentMethod === 'UPI' ? upiReference || undefined : undefined,
        discountAmount: Number(discountAmount) || 0,
        items: cart.map((l) => ({ medicineId: l.medicineId, batchNumber: l.batchNumber, quantity: l.quantity })),
      });
      router.push(`/partner/pharmacy/pos/sales/${sale.id}`);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not record this sale.');
      setBusy(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_360px]">
      <div>
        <Label htmlFor="pos-search">Search item</Label>
        <Input id="pos-search" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Medicine name or HSN code" />
        {matches.length > 0 && (
          <div className="mt-2 divide-y divide-brand-neutral-100 rounded-card border border-brand-neutral-200">
            {matches.map((row) => (
              <button
                key={`${row.medicineId}-${row.batchNumber}`}
                type="button"
                onClick={() => addToCart(row)}
                className="flex w-full items-center justify-between px-4 py-2.5 text-left text-sm hover:bg-brand-neutral-50"
              >
                <span>
                  <span className="font-medium text-brand-neutral-900">{row.medicineName}</span>
                  <span className="ml-2 text-xs text-brand-neutral-400">batch {row.batchNumber} · {row.quantityAvailable} in stock</span>
                </span>
                <span className="text-brand-neutral-600">₹{row.price}</span>
              </button>
            ))}
          </div>
        )}

        <div className="mt-6 space-y-2">
          {cart.map((line, i) => (
            <div key={`${line.medicineId}-${line.batchNumber}`} className="flex items-center justify-between rounded-card border border-brand-neutral-200 p-3">
              <div>
                <p className="text-sm font-medium text-brand-neutral-900">{line.medicineName}</p>
                <p className="text-xs text-brand-neutral-400">batch {line.batchNumber} · ₹{line.unitPrice} each</p>
              </div>
              <div className="flex items-center gap-2">
                <Input
                  className="w-16"
                  inputMode="numeric"
                  value={String(line.quantity)}
                  onChange={(e) => updateQuantity(i, Number(e.target.value) || 1)}
                />
                <span className="w-16 text-right text-sm text-brand-neutral-700">₹{line.unitPrice * line.quantity}</span>
                <Button variant="ghost" size="sm" onClick={() => removeLine(i)}>
                  Remove
                </Button>
              </div>
            </div>
          ))}
          {cart.length === 0 && <p className="text-sm text-brand-neutral-500">Search above to add items.</p>}
        </div>
      </div>

      <div className="space-y-4 rounded-card border border-brand-neutral-200 p-5">
        {error && <Alert tone="error">{error}</Alert>}
        <div>
          <Label htmlFor="pos-customer-name">Customer name (optional)</Label>
          <Input id="pos-customer-name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="pos-customer-phone">Customer phone (optional)</Label>
          <Input id="pos-customer-phone" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
        </div>
        <div>
          <Label htmlFor="pos-payment-method">Payment method</Label>
          <Select id="pos-payment-method" value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as (typeof PAYMENT_METHODS)[number])}>
            {PAYMENT_METHODS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </Select>
        </div>
        {paymentMethod === 'UPI' && (
          <div>
            <Label htmlFor="pos-upi-ref">UPI reference</Label>
            <Input id="pos-upi-ref" value={upiReference} onChange={(e) => setUpiReference(e.target.value)} />
          </div>
        )}
        <div>
          <Label htmlFor="pos-discount">Discount (₹)</Label>
          <Input id="pos-discount" inputMode="numeric" value={discountAmount} onChange={(e) => setDiscountAmount(e.target.value)} />
        </div>
        <div className="border-t border-brand-neutral-100 pt-3 text-sm">
          <div className="flex justify-between text-brand-neutral-600">
            <span>Subtotal</span>
            <span>₹{subtotal}</span>
          </div>
          <p className="mt-1 text-xs text-brand-neutral-400">GST is added on the invoice after checkout.</p>
        </div>
        <Button className="w-full" loading={busy} onClick={handleCheckout}>
          Complete sale
        </Button>
      </div>
    </div>
  );
}
