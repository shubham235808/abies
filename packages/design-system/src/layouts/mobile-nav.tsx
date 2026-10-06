'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useState } from 'react';
import type { PortalNavItem } from './portal-shell';

// Replaces the old unlabeled horizontal-scroll nav strip (docs/UI-UX-AUDIT.md
// Finding 3 — it truncated mid-word with no indication there was more to
// scroll to). A hamburger + full-width dropdown is the brief's own
// recommended "Sidebar → drawer/bottom navigation" pattern for mobile.
export function MobileNav({ nav }: { nav: PortalNavItem[] }) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

  return (
    <div className="border-t border-brand-neutral-100 md:hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between px-4 py-2.5 text-sm font-medium text-brand-neutral-700"
      >
        <span>Menu</span>
        <svg className={`h-4 w-4 transition-transform ${open ? 'rotate-180' : ''}`} viewBox="0 0 20 20" fill="currentColor" aria-hidden="true">
          <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
        </svg>
      </button>
      {open && (
        <nav className="space-y-1 border-t border-brand-neutral-100 px-4 pb-3 pt-2">
          {nav.map((item) => {
            const active = pathname === item.href;
            if (item.soon) {
            return (
              <span key={item.href} className="block rounded-control px-3 py-2 text-sm font-bold text-brand-neutral-400">
                {item.label} <span className="text-[10px] uppercase">· Soon</span>
              </span>
            );
          }
          return (
              <Link
                key={item.href}
                href={item.href}
                onClick={() => setOpen(false)}
                className={`block rounded-md px-3 py-2 text-sm ${
                  active ? 'bg-brand-purple-50 text-brand-purple-700' : 'text-brand-neutral-700 hover:bg-brand-neutral-100'
                }`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      )}
    </div>
  );
}
