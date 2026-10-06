'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { PortalNavItem } from './portal-shell';

export function PortalSidebarNav({ nav }: { nav: PortalNavItem[] }) {
  const pathname = usePathname();
  return (
    <nav className="space-y-1">
      {nav.map((item) => {
        const active = pathname === item.href;
        if (item.soon) {
          return (
            <span key={item.href} className="flex items-center justify-between rounded-control px-3 py-2.5 text-sm font-bold text-brand-neutral-400">
              {item.label}
              <span className="rounded-pill bg-brand-neutral-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-brand-neutral-500">Soon</span>
            </span>
          );
        }
        return (
          <Link
            key={item.href}
            href={item.href}
            className={`block rounded-control px-3 py-2.5 text-sm font-bold ${
              active ? 'bg-brand-purple-50 text-brand-purple-700' : 'text-brand-neutral-700 hover:bg-brand-neutral-50'
            }`}
          >
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
