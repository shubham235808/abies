'use client';

import { useState } from 'react';

export function FaqAccordion({ items }: { items: { id: string; question: string; answer: string }[] }) {
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <div className="divide-y divide-brand-neutral-100 border-b border-brand-neutral-100">
      {items.map((item) => (
        <div key={item.id} className="py-4">
          <button
            type="button"
            onClick={() => setOpenId(openId === item.id ? null : item.id)}
            className="flex w-full items-center justify-between gap-4 text-left font-bold text-brand-neutral-900"
            aria-expanded={openId === item.id}
          >
            <span>{item.question}</span>
            <span className="shrink-0 text-xl text-brand-purple-600" aria-hidden="true">
              {openId === item.id ? '−' : '+'}
            </span>
          </button>
          {openId === item.id && <p className="mt-2.5 whitespace-pre-line text-sm text-brand-neutral-500">{item.answer}</p>}
        </div>
      ))}
    </div>
  );
}
