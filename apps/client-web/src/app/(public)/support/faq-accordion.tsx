'use client';

import { useState } from 'react';

export function FaqAccordion({ items }: { items: { q: string; a: string }[] }) {
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  return (
    <div className="mt-4 divide-y divide-brand-neutral-100 border-b border-brand-neutral-100">
      {items.map((item, i) => (
        <div key={item.q} className="py-4">
          <button
            type="button"
            onClick={() => setOpenFaq(openFaq === i ? null : i)}
            className="flex w-full items-center justify-between gap-4 text-left font-bold text-brand-neutral-900"
            aria-expanded={openFaq === i}
          >
            <span>{item.q}</span>
            <span className="shrink-0 text-xl text-brand-purple-600" aria-hidden="true">
              {openFaq === i ? '−' : '+'}
            </span>
          </button>
          {openFaq === i && <p className="mt-2.5 text-sm text-brand-neutral-500">{item.a}</p>}
        </div>
      ))}
    </div>
  );
}
