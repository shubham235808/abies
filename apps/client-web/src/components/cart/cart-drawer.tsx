'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Button } from '@abies/design-system/components/ui/button';
import { api, ApiError } from '@abies/design-system/api-client';

type CartItem = {
  id: string;
  medicineId: string;
  medicineName: string;
  imageUrl: string | null;
  variantLabel: string | null;
  quantity: number;
  unitPrice: number | null;
  available: boolean;
};
type Cart = { id: string; pharmacy: { id: string; name: string | null }; items: CartItem[]; subtotal: number };

// A quick-glance slide-in drawer (matches the reference prototype's cart
// drawer pattern) over the real cart already built in EXPANSION-1b —
// shows what's in it and lets an item be removed inline, but defers
// quantity editing and checkout (per-pharmacy delivery address, payment)
// to the full /patient/medicines/cart page, linked at the bottom, since
// that flow needs more room than a drawer offers.
export function CartDrawer({ open, onClose, onCountChange }: { open: boolean; onClose: () => void; onCountChange: (count: number) => void }) {
  const [carts, setCarts] = useState<Cart[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [signedOut, setSignedOut] = useState(false);
  const [removingId, setRemovingId] = useState<string | null>(null);
  const ref = useRef<HTMLDialogElement>(null);

  // Native <dialog> + showModal(), same pattern as components/ui/modal.tsx
  // — renders in the browser's top layer, which sidesteps a real bug a
  // translateX-based off-canvas <aside> had: it contributed its full
  // width to the document's scrollable overflow even while translated
  // off-screen (verified live: a closed drawer let the page scroll 420px
  // horizontally, exactly its own width). Top-layer content isn't part
  // of normal document flow, so it can't do that. Also gets focus-trap
  // and Escape-to-close for free.
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    api
      .get<{ carts: Cart[] }>('/api/v1/patients/me/cart')
      .then((res) => {
        setCarts(res.carts);
        setError(null);
        setSignedOut(false);
      })
      .catch((err) => {
        if (err instanceof ApiError && err.status === 401) setSignedOut(true);
        else setError(err instanceof ApiError ? err.message : 'Could not load your cart.');
      });
  }, [open]);

  useEffect(() => {
    if (!carts) return;
    onCountChange(carts.reduce((sum, c) => sum + c.items.reduce((s, i) => s + i.quantity, 0), 0));
  }, [carts, onCountChange]);

  async function handleRemove(itemId: string) {
    setRemovingId(itemId);
    setError(null);
    try {
      await api.delete(`/api/v1/patients/me/cart/items/${itemId}`);
      setCarts((prev) =>
        (prev ?? [])
          .map((c) => ({ ...c, items: c.items.filter((i) => i.id !== itemId) }))
          .filter((c) => c.items.length > 0),
      );
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Could not remove this item.');
    } finally {
      setRemovingId(null);
    }
  }

  const allItems = carts?.flatMap((c) => c.items.map((i) => ({ ...i, pharmacyName: c.pharmacy.name }))) ?? [];
  const total = carts?.reduce((sum, c) => sum + c.subtotal, 0) ?? 0;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onCancel={onClose}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      // `open:flex` not a bare `flex` — a plain `flex` utility is
      // author-origin CSS, which overrides the UA stylesheet's
      // `dialog:not([open]) { display: none }` regardless of specificity
      // (author beats user-agent origin unconditionally), so the dialog
      // would otherwise render and intercept clicks even while "closed".
      // `open:` only applies display:flex once the dialog element's own
      // `open` attribute is set (i.e. after showModal()).
      className="fixed inset-y-0 left-auto right-0 m-0 hidden h-screen max-h-none w-full max-w-[420px] open:flex flex-col rounded-none border-0 bg-white p-0 shadow-2xl backdrop:bg-brand-neutral-900/40"
    >
      <div className="flex items-center justify-between border-b border-brand-neutral-100 px-5 py-4">
        <div>
          <p className="text-xs text-brand-neutral-500">Your order</p>
          <h3 className="text-lg font-semibold text-brand-neutral-900">Cart</h3>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="flex h-9 w-9 items-center justify-center rounded-control bg-brand-purple-50 text-xl text-brand-purple-700"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-auto px-5 py-4">
        {signedOut && (
          <div className="py-10 text-center text-sm text-brand-neutral-500">
            <Link href="/login" onClick={onClose} className="font-medium text-brand-purple-700 underline">
              Log in as a patient
            </Link>{' '}
            to view your cart.
          </div>
        )}
        {error && <p className="mb-3 text-sm text-brand-magenta-600">{error}</p>}
        {carts === null && !error && !signedOut && <p className="text-sm text-brand-neutral-500">Loading…</p>}
        {carts !== null && allItems.length === 0 && (
          <div className="py-10 text-center text-sm text-brand-neutral-500">
            Your cart is empty.
            <br />
            <span className="text-xs">Add medicines from the catalogue.</span>
          </div>
        )}
        <div className="divide-y divide-brand-neutral-100">
          {allItems.map((item) => (
            <div key={item.id} className="grid grid-cols-[44px_1fr_auto] items-center gap-3 py-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-control bg-brand-purple-50">
                {item.imageUrl ? (
                  <Image src={item.imageUrl} alt={item.medicineName} width={44} height={44} className="rounded-control object-contain" />
                ) : (
                  <span aria-hidden="true">💊</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-brand-neutral-900">
                  {item.medicineName}
                  {item.variantLabel ? ` (${item.variantLabel})` : ''}
                </p>
                <p className="text-xs text-brand-neutral-500">
                  {item.pharmacyName} · ×{item.quantity}
                </p>
                <p className="text-xs text-brand-neutral-500">{item.unitPrice != null ? `₹${item.unitPrice}` : 'Unavailable'}</p>
              </div>
              <button
                type="button"
                onClick={() => handleRemove(item.id)}
                disabled={removingId === item.id}
                className="text-brand-magenta-600 disabled:opacity-50"
                aria-label={`Remove ${item.medicineName}`}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      </div>

      {!signedOut && (
        <div className="border-t border-brand-neutral-100 px-5 py-4">
          <div className="mb-3 flex justify-between text-sm">
            <span>Total</span>
            <strong>₹{total}</strong>
          </div>
          <Link href="/patient/medicines/cart" onClick={onClose}>
            <Button className="w-full">View cart & checkout</Button>
          </Link>
        </div>
      )}
    </dialog>
  );
}
