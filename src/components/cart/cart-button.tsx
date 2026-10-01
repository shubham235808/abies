'use client';

import { useState } from 'react';
import { CartDrawer } from './cart-drawer';

export function CartButton({ initialCount }: { initialCount: number }) {
  const [open, setOpen] = useState(false);
  const [count, setCount] = useState(initialCount);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open cart"
        className="relative flex h-[42px] w-[42px] items-center justify-center rounded-control border border-brand-neutral-200 bg-white text-lg"
      >
        🛒
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-[18px] min-w-[18px] items-center justify-center rounded-pill bg-brand-magenta-500 px-1 text-[11px] font-semibold text-white">
            {count}
          </span>
        )}
      </button>
      <CartDrawer open={open} onClose={() => setOpen(false)} onCountChange={setCount} />
    </>
  );
}
