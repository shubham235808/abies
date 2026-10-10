'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export function NavLinks({ items }: { items: { key?: string; href: string; label: string }[] }) {
  const pathname = usePathname();
  return (
    <nav className="hidden items-center gap-6 text-sm font-bold md:flex" aria-label="Primary navigation">
      {items.map((item) => {
        const active = pathname === item.href || (item.href !== '/' && pathname.startsWith(item.href));
        return (
          <Link
            key={item.key ?? item.href}
            href={item.href}
            className={`relative py-2 ${active ? 'text-brand-purple-700' : 'text-brand-neutral-700 hover:text-brand-purple-700'}`}
          >
            {item.label}
            {active && (
              <span className="absolute inset-x-0 -bottom-[13px] h-[3px] rounded-full bg-gradient-to-r from-brand-purple-500 to-brand-magenta-500" />
            )}
          </Link>
        );
      })}
    </nav>
  );
}
